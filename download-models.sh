#!/bin/bash
# Downloads every model in a list into ComfyUI's models folder.
# Usage: download-models.sh <list file> <models dir>
# A file whose size already matches Hugging Face is skipped; a partial one
# resumes. Each download writes to a .part file and is renamed when complete,
# so ComfyUI never lists a half-written model.
LIST="$1"
MODELS_DIR="$2"

fetch() {
  local folder="$1" path="$2"
  local url="https://huggingface.co/$path"
  local dest="$MODELS_DIR/$folder/$(basename "$path")"
  local size
  size=$(curl -sIL "$url" | tr -d '\r' | awk 'tolower($1)=="x-linked-size:"{print $2}' | tail -1)
  if [ -n "$size" ] && [ -f "$dest" ] && [ "$(stat -c %s "$dest")" = "$size" ]; then
    echo "have $(basename "$dest")"
    return
  fi
  mkdir -p "$MODELS_DIR/$folder"
  if curl -sSL -C - --retry 5 -o "$dest.part" "$url" \
     && { [ -z "$size" ] || [ "$(stat -c %s "$dest.part")" = "$size" ]; }; then
    mv "$dest.part" "$dest"
    echo "done $(basename "$dest")"
  else
    echo "FAILED $(basename "$dest") — restart the pod to resume"
  fi
}

while read -r folder path; do
  fetch "$folder" "$path" &
done < <(grep -vE '^\s*(#|$)' "$LIST")
wait
echo ALL_DONE
