// Realism comes from photographic specificity, not adjective stacking. Every
// prompt names a camera, a lens, a light source and a skin detail, because
// those are the cues diffusion models map onto real photographs rather than
// onto illustration.

export const POSES = [
  { id: 'soles-together', label: 'Soles together',
    prompt: 'sitting on the floor with both bare feet raised and pressed together side by side, soles turned toward the camera, knees bent' },
  { id: 'toe-splay', label: 'Toes spread',
    prompt: 'bare feet with the toes deliberately spread wide apart, the long extensor tendons standing out across the top of each foot' },
  { id: 'arched', label: 'Arched / pointed',
    prompt: 'one bare foot pointed hard into a full arch, ballet pointe, the toes extended and the top of the foot in a continuous line with the shin' },
  { id: 'flexed', label: 'Flexed back',
    prompt: 'one bare foot pulled sharply back toward the shin, toes fanned upward, the achilles tendon and heel cord drawn tight' },
  { id: 'crossed', label: 'Crossed at the ankle',
    prompt: 'bare feet resting with one ankle crossed loosely over the other, toes relaxed and slightly curled' },
  { id: 'tiptoe', label: 'Up on tiptoe',
    prompt: 'standing lifted onto the balls of both bare feet, heels raised clear of the floor, calf muscles engaged' },
  { id: 'walking', label: 'Mid-step',
    prompt: 'caught mid-stride barefoot, the rear foot rolling off the toes while the front foot meets the floor heel first' },
  { id: 'resting', label: 'Resting, stacked',
    prompt: 'lying with bare legs extended and one foot resting across the top of the other, ankles loose, toes relaxed' },
  { id: 'curled', label: 'Toes curled under',
    prompt: 'bare toes curled down and gripping, the arch drawn up and the tendons visible along the instep' },
  { id: 'dangling', label: 'Dangling, seated',
    prompt: 'seated on a raised edge with bare feet hanging free, ankles loose, toes pointing gently down' },
];

export const VIEWS = [
  { id: 'soles', label: 'Soles to camera',
    prompt: 'shot square on from behind the soles so both plantar surfaces fill the frame, heels nearest the lens' },
  { id: 'top', label: 'From above',
    prompt: 'shot from directly above looking down onto the tops of the feet' },
  { id: 'profile', label: 'Side profile',
    prompt: 'shot from the side at floor level, the arch and instep in clean profile' },
  { id: 'three-quarter', label: 'Three-quarter',
    prompt: 'shot from a three-quarter angle, slightly above and to one side' },
  { id: 'pov', label: 'Own point of view',
    prompt: 'first-person point of view looking down past the knees toward the feet' },
  { id: 'heel', label: 'From behind',
    prompt: 'shot from directly behind, centred on the heels and achilles tendons' },
];

export const SETTINGS = [
  { id: 'studio', label: 'Studio',
    prompt: 'in a photography studio against a seamless mid-grey backdrop, large softbox key light from the upper left and a white bounce card filling the shadows' },
  { id: 'yoga-mat', label: 'Dark yoga mat',
    prompt: 'on a charcoal textured yoga mat in a bright room, soft overcast daylight from a large window to one side' },
  { id: 'bed', label: 'Bedroom',
    prompt: 'on rumpled white cotton bedding, late-afternoon sun raking across from a nearby window' },
  { id: 'wood', label: 'Wooden floor',
    prompt: 'on a pale oak floor, diffused north-facing daylight, faint soft shadows' },
  { id: 'beach', label: 'Beach',
    prompt: 'on damp fine sand at the water line, low warm evening sun from behind the camera' },
  { id: 'grass', label: 'Grass',
    prompt: 'on short sunlit lawn grass, open shade with warm bounce from the ground' },
];

// Applied to every prompt. This is what separates a photograph from a render.
const CAMERA = 'shot on a full-frame DSLR with an 85mm f/1.8 lens at f/4, 1/250s, ISO 200, sharp focus on the toes with a gently soft background';
const SKIN = 'natural untouched skin with visible pores, fine creases across the ball of the foot, faint tan lines, slight redness at the heel and under the toes, short bare unpainted nails';
const REAL = 'candid unretouched photograph, natural colour, subtle film grain, no beauty retouching, imperfect and lifelike';

const SUBJECT = "An adult person's bare feet.";
const ANATOMY = 'exactly five toes on each foot, correct toe order and proportion, anatomically accurate';

export const NEGATIVE = [
  'extra toes', 'six toes', 'missing toes', 'fused toes', 'webbed toes', 'malformed feet',
  'twisted ankle', 'extra limbs', 'deformed anatomy',
  'plastic skin', 'waxy', 'airbrushed', 'smooth featureless skin', 'cgi', '3d render', 'illustration',
  'cartoon', 'painting', 'blurry', 'low resolution', 'jpeg artifacts', 'watermark', 'text', 'logo',
  'nsfw', 'nude', 'sexual', 'child', 'minor', 'underage',
].join(', ');

const find = (list, id) => list.find((entry) => entry.id === id);

/** Compose one photographic description from the three chosen controls. */
export function buildPrompt({ pose, view, setting, extra } = {}) {
  const parts = [
    find(POSES, pose)?.prompt,
    find(VIEWS, view)?.prompt,
    find(SETTINGS, setting)?.prompt,
    extra?.trim() || null,
    SKIN,
    CAMERA,
    REAL,
    ANATOMY,
  ].filter(Boolean);

  return `${SUBJECT} ${parts.join('. ')}.`;
}

export const CATALOG = { POSES, VIEWS, SETTINGS };
