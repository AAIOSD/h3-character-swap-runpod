// "+ Add reference image" for the MiniMax H3 character-swap workflow.
//
// The button sits on the image box wired to the H3 node's first reference
// slot (② Character Image). Each click adds a Load Image box, wires it to the
// next free ref_image slot (up to 9), and adds a matching
// "<Subject N> is the person shown in <Picture N>." line to the
// subject_definitions section of the hand-written prompt. Deleting an added
// box closes the gap: later images move down a slot and every <Subject>/
// <Picture> tag above it is renumbered, so the prompt keeps matching the
// slots. <Subject 10> is the workflow's background and is never touched.
import { app } from "../../scripts/app.js";

const H3_TYPE = "MiniMaxH3ReferenceToVideo";
const SLOT_PREFIX = "ref_images.ref_image_";
const MAX_IMAGES = 9;
const BUTTON_LABEL = "+ Add reference image";
const ADDED_FLAG = "h3_added_ref_image";

function h3Node() {
  return app.graph._nodes.find((n) => n.type === H3_TYPE) || null;
}

function slotIndex(node, k) {
  return node.findInputSlot(SLOT_PREFIX + k);
}

function sourceOf(node, k) {
  const slot = slotIndex(node, k);
  if (slot < 0) return null;
  const linkId = node.inputs[slot].link;
  if (linkId == null) return null;
  const link = app.graph.links[linkId];
  return link ? app.graph.getNodeById(link.origin_id) : null;
}

// Image boxes wired to H3, in slot order. Slot 0 is the character image.
function connectedImages(node) {
  const out = [];
  for (let k = 0; k < MAX_IMAGES; k++) {
    const src = sourceOf(node, k);
    if (src) out.push(src);
  }
  return out;
}

// The prompt box the user writes in: the multiline primitive whose text
// starts with subject_definitions:. The Gemini instructions box also mentions
// it, but starts with "You write prompts".
function promptWidget() {
  for (const n of app.graph._nodes) {
    if (n.type !== "PrimitiveStringMultiline") continue;
    const w = n.widgets?.find((x) => typeof x.value === "string");
    if (w && w.value.trimStart().startsWith("subject_definitions:")) return w;
  }
  return null;
}

function setPrompt(widget, text) {
  widget.value = text;
  widget.callback?.(text);
  app.graph.setDirtyCanvas(true, true);
}

function addSubjectLine(n) {
  const w = promptWidget();
  if (!w) return;
  const lines = w.value.split("\n");
  const start = lines.findIndex((l) => l.trim().startsWith("subject_definitions:"));
  if (start < 0) return;
  // After the last subject line of the subject_definitions section.
  let at = start + 1;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^\s*$/.test(lines[i]) || /^\s*[a-z_]+:\s*$/.test(lines[i])) break;
    if (/^\s*<Subject [1-9]>/.test(lines[i])) at = i + 1;
  }
  lines.splice(at, 0, `<Subject ${n}> is the person shown in <Picture ${n}>.`);
  setPrompt(w, lines.join("\n"));
}

// Picture n is gone: drop its subject lines and shift every tag above it
// down by one. Only 1–9 are image numbers; Subject 10 is the background.
function removeSubject(n) {
  const w = promptWidget();
  if (!w) return;
  let text = w.value
    .split("\n")
    .filter((l) => !new RegExp(`^\\s*<Subject ${n}>`).test(l))
    .join("\n");
  text = text.replace(/<(Subject|Picture) ([1-9])>/g, (m, tag, d) => {
    const k = Number(d);
    return k > n ? `<${tag} ${k - 1}>` : m;
  });
  setPrompt(w, text);
}

// Re-wire the remaining images to consecutive slots after one is deleted,
// unless the H3 node already closed the gap itself.
function compact(node) {
  const images = connectedImages(node);
  const gapless = images.every((img, k) => sourceOf(node, k) === img);
  if (!gapless) {
    for (let k = 0; k < MAX_IMAGES; k++) {
      const slot = slotIndex(node, k);
      if (slot >= 0 && node.inputs[slot].link != null) node.disconnectInput(slot);
    }
    images.forEach((img, k) => {
      const slot = slotIndex(node, k);
      if (slot >= 0) img.connect(0, node, slot);
    });
  }
  recordPositions(node);
}

// Each image box remembers which picture it is. The link is already gone by
// the time a deleted box hears about it, so this is how it knows.
function recordPositions(node) {
  connectedImages(node).forEach((img, k) => {
    img.__h3Picture = k + 1;
    if (img.properties?.[ADDED_FLAG]) img.title = `Reference image ${k + 1}`;
  });
  app.graph.setDirtyCanvas(true, true);
}

function watchRemoval(imageNode) {
  if (imageNode.__h3Watched) return;
  imageNode.__h3Watched = true;
  const prior = imageNode.onRemoved;
  imageNode.onRemoved = function () {
    prior?.apply(this, arguments);
    const node = h3Node();
    const picture = this.__h3Picture;
    if (!node || !picture || picture < 2) return;
    setTimeout(() => {
      compact(node);
      removeSubject(picture);
    }, 0);
  };
}

function addReferenceImage(anchor) {
  const node = h3Node();
  if (!node) return;
  const count = connectedImages(node).length;
  if (count >= MAX_IMAGES) {
    app.extensionManager?.toast?.add({ severity: "warn", summary: "H3 takes at most 9 reference images", life: 3000 });
    return;
  }
  const img = LiteGraph.createNode("LoadImage");
  img.title = `Reference image ${count + 1}`;
  img.properties[ADDED_FLAG] = true;
  // A column to the left of the inputs group, four boxes per column.
  const k = count - 1;
  img.pos = [anchor.pos[0] - 1040 - Math.floor(k / 4) * 400, anchor.pos[1] + (k % 4) * 440];
  app.graph.add(img);
  // The H3 node grows its next slot once the previous one is connected.
  const slot = slotIndex(node, count);
  if (slot < 0) {
    app.graph.remove(img);
    return;
  }
  img.connect(0, node, slot);
  watchRemoval(img);
  recordPositions(node);
  addSubjectLine(count + 1);
}

function decorate() {
  const node = h3Node();
  if (!node) return;
  const anchor = sourceOf(node, 0);
  if (anchor && !anchor.widgets?.some((w) => w.name === BUTTON_LABEL)) {
    anchor.addWidget("button", BUTTON_LABEL, null, () => addReferenceImage(anchor), { serialize: false });
    anchor.setSize(anchor.computeSize());
  }
  for (const img of connectedImages(node).slice(1)) watchRemoval(img);
  recordPositions(node);
}

app.registerExtension({
  name: "h3.ReferenceImages",
  async afterConfigureGraph() {
    decorate();
  },
});
