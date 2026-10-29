#!/bin/bash
# Runs on every pod start, before the image's own /start.sh launches ComfyUI.
# The template's start command clones this repo and runs this file, then
# hands over to /start.sh. Every step checks before it acts, so a restart
# only repeats what is missing.
#
# Model downloads run in the background; ComfyUI lists each model as soon as
# its file is complete (refresh the page or press R).

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=manifest.env
source "$REPO_DIR/manifest.env"

# Layout of the runpod/comfyui image, as its /start.sh defines it.
SLIM_DIR=/workspace/runpod-slim
COMFYUI_DIR="$SLIM_DIR/ComfyUI"
BAKED_DIR=/opt/comfyui-baked
VENV_DIR="$COMFYUI_DIR/.venv-cu128"
ARGS_FILE="$SLIM_DIR/comfyui_args.txt"
CONSTRAINTS=/opt/comfyui-runtime-constraints.txt
LOG="$SLIM_DIR/h3-bootstrap.log"

mkdir -p "$SLIM_DIR"
exec > >(tee -a "$LOG") 2>&1
echo "=== H3 bootstrap $(date -u +%FT%TZ) ==="

pip_install() {
  "$VENV_DIR/bin/python" -m pip install -q --no-cache-dir -c "$CONSTRAINTS" "$@"
}

# The same first-time copy /start.sh makes, done here so ComfyUI can be
# upgraded and given its nodes before it first starts. /start.sh then finds
# both and only activates the venv.
if [ ! -d "$COMFYUI_DIR" ]; then
  echo "Copying baked ComfyUI to the workspace"
  cp -r "$BAKED_DIR" "$COMFYUI_DIR"
fi
if [ ! -d "$VENV_DIR" ]; then
  echo "Creating the ComfyUI venv"
  python3.12 -m venv --system-site-packages --without-pip "$VENV_DIR"
fi

# ComfyUI release
cd "$COMFYUI_DIR" || exit 1
if [ "$(git describe --tags --exact-match 2>/dev/null)" != "$COMFYUI_TAG" ]; then
  echo "Updating ComfyUI to $COMFYUI_TAG"
  git fetch -q --depth 1 origin "refs/tags/$COMFYUI_TAG:refs/tags/$COMFYUI_TAG" --force \
    && git checkout -q "$COMFYUI_TAG" \
    && pip_install -r requirements.txt \
    || echo "WARNING: ComfyUI update failed; the workflow may show missing nodes"
fi

# Node packs, pinned
mkdir -p "$COMFYUI_DIR/custom_nodes"
while read -r url commit; do
  [ -z "$url" ] && continue
  dir="$COMFYUI_DIR/custom_nodes/$(basename "$url" .git)"
  if [ "$(git -C "$dir" rev-parse HEAD 2>/dev/null)" != "$commit" ]; then
    echo "Installing $(basename "$dir") @ ${commit:0:7}"
    [ -d "$dir/.git" ] || git clone -q "$url" "$dir"
    git -C "$dir" fetch -q origin "$commit" && git -C "$dir" checkout -q "$commit"
    [ -f "$dir/requirements.txt" ] && pip_install -r "$dir/requirements.txt"
  fi
done <<< "$NODE_PACKS"

# The add-reference-image button, kept in step with this repo
rsync -a --delete "$REPO_DIR/comfyui-h3-ref-images/" "$COMFYUI_DIR/custom_nodes/comfyui-h3-ref-images/"

# Workflows: copied once, so a user's saved edits are never overwritten
WF_DIR="$COMFYUI_DIR/user/default/workflows"
mkdir -p "$WF_DIR"
for wf in "$REPO_DIR"/workflows/*.json; do
  [ -f "$WF_DIR/$(basename "$wf")" ] || cp "$wf" "$WF_DIR/"
done

# Startup options
[ -f "$ARGS_FILE" ] || echo "# Add your custom ComfyUI arguments here (one per line)" > "$ARGS_FILE"
for arg in $COMFYUI_ARGS; do
  grep -qxF -- "$arg" "$ARGS_FILE" || echo "$arg" >> "$ARGS_FILE"
done

# Models, in the background
MODEL_SET="${H3_MODELS:-$DEFAULT_MODEL_SET}"
MODEL_LIST="$REPO_DIR/models/$MODEL_SET.txt"
if [ -f "$MODEL_LIST" ]; then
  echo "Downloading the '$MODEL_SET' models in the background (log: $SLIM_DIR/h3-models.log)"
  setsid nohup bash "$REPO_DIR/download-models.sh" "$MODEL_LIST" "$COMFYUI_DIR/models" \
    > "$SLIM_DIR/h3-models.log" 2>&1 < /dev/null &
else
  echo "WARNING: no model list '$MODEL_SET' (set H3_MODELS to one of: $(ls "$REPO_DIR/models" | sed 's/\.txt//' | tr '\n' ' '))"
fi

echo "=== H3 bootstrap done; starting ComfyUI ==="
