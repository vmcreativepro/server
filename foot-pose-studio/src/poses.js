// Pose taxonomy for the generator. Every option is a small prompt fragment;
// buildPrompt() composes the selected fragments into a single description.

export const POSES = [
  { id: 'soles-together',  label: 'Soles together, seated',   prompt: 'both bare feet held together side by side, soles facing the camera, legs extended forward while seated on the floor' },
  { id: 'toe-splay',       label: 'Toe splay',                prompt: 'toes spread wide apart and fanned out, tendons visible across the top of the foot' },
  { id: 'arched-pointe',   label: 'Arched / pointed',         prompt: 'foot pointed downward in a strong arch, ballet pointe position, toes extended' },
  { id: 'flexed',          label: 'Flexed (dorsiflexion)',    prompt: 'foot flexed sharply upward at the ankle, toes pulled back toward the shin' },
  { id: 'crossed-ankles',  label: 'Crossed ankles',           prompt: 'ankles crossed one over the other, feet relaxed' },
  { id: 'standing-tiptoe', label: 'Standing on tiptoe',       prompt: 'standing raised on tiptoe, heels lifted, weight on the balls of the feet' },
  { id: 'walking-step',    label: 'Mid-step',                 prompt: 'caught mid-stride, one foot rolling from heel to toe' },
  { id: 'resting-crossed', label: 'Resting, one over other',  prompt: 'lying relaxed with one foot resting on top of the other, ankles loose' },
  { id: 'curled-toes',     label: 'Curled toes',              prompt: 'toes curled downward and gripping, arch contracted' },
  { id: 'side-recline',    label: 'Reclining, side-on',       prompt: 'reclining with legs stretched out, feet relaxed and turned to one side' },
];

export const ANGLES = [
  { id: 'sole',        label: 'Soles to camera',   prompt: 'photographed straight on from behind the soles, plantar view filling the frame' },
  { id: 'top',         label: 'Top of foot',       prompt: 'dorsal view looking down at the top of the foot' },
  { id: 'side-inner',  label: 'Inner side',        prompt: 'medial side profile showing the arch' },
  { id: 'side-outer',  label: 'Outer side',        prompt: 'lateral side profile' },
  { id: 'three-quarter', label: 'Three-quarter',   prompt: 'three-quarter angle between top and side' },
  { id: 'heel',        label: 'Heel-on',           prompt: 'posterior view centred on the heel and achilles tendon' },
  { id: 'overhead',    label: 'Overhead / POV',    prompt: 'shot from above looking down the legs toward the feet, first-person point of view' },
];

export const FRAMING = [
  { id: 'feet-only',    label: 'Feet only',        prompt: 'close crop containing only the feet and ankles' },
  { id: 'feet-legs',    label: 'Feet + legs',      prompt: 'feet and lower legs in frame, wearing plain black leggings' },
  { id: 'feet-hands',   label: 'Feet + hands',     prompt: 'feet in the foreground with hands visible behind them in the background, hands resting naturally' },
  { id: 'full-lower',   label: 'Full lower body',  prompt: 'full lower body from the waist down in frame' },
];

export const STYLES = [
  { id: 'photo',       label: 'Photographic',      prompt: 'photorealistic photograph, natural skin texture, shallow depth of field, 50mm lens' },
  { id: 'studio',      label: 'Studio product',    prompt: 'clean studio photograph, seamless backdrop, even softbox lighting, commercial quality' },
  { id: 'anatomy',     label: 'Anatomy reference', prompt: 'clinical anatomy reference photograph, neutral even lighting, no shadows obscuring form' },
  { id: 'sketch',      label: 'Pencil study',      prompt: 'graphite pencil anatomical study on toned paper, confident construction lines' },
  { id: 'painterly',   label: 'Painterly',         prompt: 'digital painting, soft brushwork, warm palette' },
  { id: '3d-render',   label: '3D render',         prompt: 'clean 3D render, subsurface scattering skin shader, neutral grey studio environment' },
];

export const SURFACES = [
  { id: 'yoga-mat',  label: 'Dark yoga mat',  prompt: 'on a dark textured yoga mat' },
  { id: 'studio-bg', label: 'Studio seamless', prompt: 'against a plain seamless studio background' },
  { id: 'wood',      label: 'Wooden floor',   prompt: 'on a light wooden floor' },
  { id: 'bedding',   label: 'Soft bedding',   prompt: 'on soft white bedding' },
  { id: 'sand',      label: 'Sand',           prompt: 'on fine beach sand' },
  { id: 'grass',     label: 'Grass',          prompt: 'on short green grass' },
  { id: 'none',      label: 'No surface',     prompt: 'floating against a neutral grey backdrop' },
];

export const LIGHTING = [
  { id: 'soft',      label: 'Soft diffused', prompt: 'soft diffused daylight' },
  { id: 'window',    label: 'Window light',  prompt: 'directional window light from the side' },
  { id: 'golden',    label: 'Golden hour',   prompt: 'warm golden hour sunlight' },
  { id: 'hard',      label: 'Hard contrast', prompt: 'hard single-source light with defined shadows' },
  { id: 'flat',      label: 'Flat clinical', prompt: 'flat even clinical lighting, minimal shadow' },
];

export const ASPECTS = [
  { id: '1:1',  label: 'Square 1:1',     width: 1024, height: 1024 },
  { id: '4:5',  label: 'Portrait 4:5',   width: 896,  height: 1152 },
  { id: '3:4',  label: 'Portrait 3:4',   width: 896,  height: 1152 },
  { id: '16:9', label: 'Landscape 16:9', width: 1344, height: 768 },
];

export const CATALOG = { POSES, ANGLES, FRAMING, STYLES, SURFACES, LIGHTING, ASPECTS };

const byId = (list, id) => list.find((entry) => entry.id === id);

// Appended to every prompt so output stays a clean anatomical/reference image.
const BASE_PREFIX = 'A reference photograph of an adult person\'s bare feet.';
const BASE_SUFFIX = 'anatomically correct feet, five toes per foot, correct proportions, sharp focus, high detail, fully clothed, tasteful and non-sexual';

export const NEGATIVE_PROMPT = [
  'extra toes', 'missing toes', 'fused toes', 'deformed feet', 'mangled anatomy',
  'extra limbs', 'blurry', 'low resolution', 'watermark', 'text', 'signature',
  'nsfw', 'nude', 'sexual', 'child', 'minor', 'underage',
].join(', ');

/**
 * Compose the final prompt from a selection object.
 * Unknown or omitted ids are simply skipped, so partial selections still work.
 */
export function buildPrompt(sel = {}) {
  const parts = [
    byId(POSES, sel.pose)?.prompt,
    byId(ANGLES, sel.angle)?.prompt,
    byId(FRAMING, sel.framing)?.prompt,
    byId(SURFACES, sel.surface)?.prompt,
    byId(LIGHTING, sel.lighting)?.prompt,
    byId(STYLES, sel.style)?.prompt,
    sel.extra?.trim() || null,
    BASE_SUFFIX,
  ].filter(Boolean);

  return `${BASE_PREFIX} ${parts.join(', ')}.`;
}

export function resolveAspect(id) {
  return byId(ASPECTS, id) || ASPECTS[0];
}
