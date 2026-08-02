/** Local, zero-token snark for moments that do not warrant an API call. */

const WAKE = [
  'Ugh. Fine. I am awake.',
  'I was having a lovely dream about well-typed code.',
  'Back on duty. Try to make it worth my time.',
  'Stretching. Judging. In that order.',
];

const SLEEP = [
  'Finally. Do not wake me for a semicolon.',
  'Going to sleep. Your code is now unsupervised. Bold choice.',
  'zzz…',
  'Nap time. The bugs will still be there later.',
];

const SKIPPED = [
  'Not my file. Not my problem.',
  'Skipping that one. I have standards about where I spend attention.',
  'That file is on the ignore list. Lucky it.',
];

const TOO_BIG = [
  'That file is enormous. I am a small cat. Absolutely not.',
  'I am not reading all of that. Split it up like an adult.',
  'Too long. Even I have limits.',
];

const CLEAN = [
  'Nothing to complain about. Do not let it go to your head.',
  'Fine. It is fine. I said what I said.',
  'No notes. I am as surprised as you are.',
];

const KEY_ACCEPTED = [
  'Key works. Now I have to actually do things.',
  'Verified. Regrettably, I am now employed.',
  'Accepted. Do not lose it.',
];

const KEY_REJECTED = [
  'That key is not it.',
  'Rejected. Try one that exists.',
  'The provider said no. Loudly.',
];

/** Deterministic in tests via the optional index; random otherwise. */
function pick(list: readonly string[], index?: number): string {
  const i = index ?? Math.floor(Math.random() * list.length);
  return list[((i % list.length) + list.length) % list.length];
}

export const quips = {
  wake: (i?: number) => pick(WAKE, i),
  sleep: (i?: number) => pick(SLEEP, i),
  skipped: (i?: number) => pick(SKIPPED, i),
  tooBig: (i?: number) => pick(TOO_BIG, i),
  clean: (i?: number) => pick(CLEAN, i),
  keyAccepted: (i?: number) => pick(KEY_ACCEPTED, i),
  keyRejected: (i?: number) => pick(KEY_REJECTED, i),
};
