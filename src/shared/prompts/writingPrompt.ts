export type DialectCode = 'mx' | 'rio';
export type DeleLevel = 'A2' | 'B1' | 'B2';

interface Topic {
  id: string;
  label: string;
  seed: string;
}

// Owner's interest rotation, per PRD §3 — never hardcode level/dialect content here.
const TOPICS: Topic[] = [
  { id: 'wine', label: 'wine', seed: 'un vino que probaste hace poco y qué te pareció' },
  { id: 'cinema', label: 'cinema', seed: 'una película que viste hace poco y por qué te gustó o no' },
  { id: 'tennis', label: 'tennis', seed: 'un partido de tenis que viste o jugaste recientemente' },
  { id: 'jazz', label: 'jazz', seed: 'un álbum o artista de jazz que has estado escuchando' },
  { id: 'art', label: 'art', seed: 'una exposición u obra de arte que te llamó la atención' },
  { id: 'fitness', label: 'fitness', seed: 'tu rutina de ejercicio esta semana' },
  { id: 'finance', label: 'venture capital / finance', seed: 'un trato o tendencia del mercado en el que has estado pensando' },
  { id: 'parenting', label: 'parenting', seed: 'un momento con tu hijo/a esta semana' },
];

const LEVEL_INSTRUCTIONS: Record<DeleLevel, string> = {
  A2: 'Escribe 3-4 oraciones sencillas, usando sobre todo el presente y el pretérito.',
  B1: 'Escribe un párrafo breve (5-7 oraciones), combinando tiempos del pasado y, si encaja de forma natural, alguna construcción con subjuntivo.',
  B2: 'Escribe un párrafo bien desarrollado (7 oraciones o más), variando los tiempos verbales y buscando vocabulario y conectores más sofisticados.',
};

export interface WritingPrompt {
  topicId: string;
  dialect: DialectCode;
  deleLevel: DeleLevel;
  text: string;
}

export function generateWritingPrompt(
  dialect: DialectCode = 'mx',
  deleLevel: DeleLevel = 'A2',
): WritingPrompt {
  const topic = TOPICS[Math.floor(Math.random() * TOPICS.length)];
  const text = `En español, escribe sobre ${topic.seed}. ${LEVEL_INSTRUCTIONS[deleLevel]}`;
  return { topicId: topic.id, dialect, deleLevel, text };
}
