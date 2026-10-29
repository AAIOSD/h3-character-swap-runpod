# H3 Character Swap on RunPod

A RunPod pod template that builds MDMZ's MiniMax H3 character-replacement
workflow in ComfyUI on first start: ComfyUI v0.43.1, the three node packs, the
models, both workflow files, and an **+ Add reference image** button.

## Use it

1. Deploy the template from its RunPod link. Pick a GPU:
   - **24 GB card** (RTX 4090): leave `H3_MODELS=compressed`, volume 120 GB.
   - **96 GB card** (RTX PRO 6000): set `H3_MODELS=full` and the volume to 220 GB.
2. Open port 8188. ComfyUI is up in a few minutes; the models keep
   downloading in the background (`/workspace/runpod-slim/h3-models.log`).
   Press **R** in ComfyUI once they finish.
3. Open `H3_Character_Swap_MDMZ_v1.json` (compressed) or
   `H3_Character_Swap_MDMZ_v1_full.json` (full) from the Workflows panel.
4. In **④ Prompt Source**, turn on **FREE PROMPT** and write your prompt in
   *Your H3 Prompt*. Partner nodes are disabled, so ComfyUI never asks you to
   sign in.

## More reference images

Click **+ Add reference image** on the *② Character Image* box. Each click adds
a Load Image box wired to the next H3 image input (up to 9) and adds
`<Subject N> is the person shown in <Picture N>.` to `subject_definitions:`.
Deleting an added box moves the later images down a slot and renumbers their
tags. The background is `<Subject 10>`, so it never collides with an image.

## What's here

| File | Job |
| --- | --- |
| `bootstrap.sh` | Runs before ComfyUI on every start; installs whatever is missing |
| `manifest.env` | ComfyUI tag, node-pack commits, startup options, default model set |
| `models/*.txt` | Model lists; `H3_MODELS` picks one by name |
| `download-models.sh` | Resumable background model downloads |
| `comfyui-h3-ref-images/` | The add-reference-image button (front-end only) |
| `workflows/` | MDMZ's workflow, compressed and full-model variants |

The template's start command is:

```
bash -c "git clone -q --depth 1 https://github.com/AAIOSD/h3-character-swap-runpod /opt/h3 && bash /opt/h3/bootstrap.sh; exec /start.sh"
```

Workflow by [MDMZ](https://www.patreon.com/MDMZ).
