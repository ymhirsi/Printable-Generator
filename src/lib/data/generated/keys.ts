// AUTO-GENERATED from master-data.docx by `npm run sync-data`.
// Do not edit by hand — edit the docx and re-sync.

import type { KeyDef, Pitch } from '../types'

const p = (step: Pitch['step'], accidental: Pitch['accidental'], octave: number): Pitch => ({ step, accidental, octave })

export const KEYS: KeyDef[] = [
  {
    id: "c-major", name: "C Major", shortLabel: "C", mode: "major",
    tonic: p('C','',4),
    keySignature: { sharps: [], flats: [] },
    diatonic: [p('C','',4),p('D','',4),p('E','',4),p('F','',4),p('G','',4),p('A','',4),p('B','',4)],
    relative: "a-minor",
  },
  {
    id: "db-major", name: "D♭ Major", shortLabel: "Db", mode: "major",
    tonic: p('D','b',4),
    keySignature: { sharps: [], flats: ["B","E","A","D","G"] },
    diatonic: [p('D','b',4),p('E','b',4),p('F','',4),p('G','b',4),p('A','b',4),p('B','b',4),p('C','',5)],
    relative: "bb-minor",
  },
  {
    id: "d-major", name: "D Major", shortLabel: "D", mode: "major",
    tonic: p('D','',4),
    keySignature: { sharps: ["F","C"], flats: [] },
    diatonic: [p('D','',4),p('E','',4),p('F','#',4),p('G','',4),p('A','',4),p('B','',4),p('C','#',5)],
    relative: "b-minor",
  },
  {
    id: "eb-major", name: "E♭ Major", shortLabel: "Eb", mode: "major",
    tonic: p('E','b',4),
    keySignature: { sharps: [], flats: ["B","E","A"] },
    diatonic: [p('E','b',4),p('F','',4),p('G','',4),p('A','b',4),p('B','b',4),p('C','',5),p('D','',5)],
    relative: "c-minor",
  },
  {
    id: "e-major", name: "E Major", shortLabel: "E", mode: "major",
    tonic: p('E','',4),
    keySignature: { sharps: ["F","C","G","D"], flats: [] },
    diatonic: [p('E','',4),p('F','#',4),p('G','#',4),p('A','',4),p('B','',4),p('C','#',5),p('D','#',5)],
    relative: "cs-minor",
  },
  {
    id: "f-major", name: "F Major", shortLabel: "F", mode: "major",
    tonic: p('F','',3),
    keySignature: { sharps: [], flats: ["B"] },
    diatonic: [p('F','',3),p('G','',3),p('A','',3),p('B','b',3),p('C','',4),p('D','',4),p('E','',4)],
    relative: "d-minor",
  },
  {
    id: "gb-major", name: "G♭ Major", shortLabel: "Gb", mode: "major",
    tonic: p('G','b',3),
    keySignature: { sharps: [], flats: ["B","E","A","D","G","C"] },
    diatonic: [p('G','b',3),p('A','b',3),p('B','b',3),p('C','b',4),p('D','b',4),p('E','b',4),p('F','',4)],
    relative: "eb-minor",
  },
  {
    id: "fs-major", name: "F# Major", shortLabel: "F#", mode: "major",
    tonic: p('F','#',3),
    keySignature: { sharps: ["F","C","G","D","A","E"], flats: [] },
    diatonic: [p('F','#',3),p('G','#',3),p('A','#',3),p('B','',3),p('C','#',4),p('D','#',4),p('E','#',4)],
    relative: "ds-minor",
  },
  {
    id: "g-major", name: "G Major", shortLabel: "G", mode: "major",
    tonic: p('G','',3),
    keySignature: { sharps: ["F"], flats: [] },
    diatonic: [p('G','',3),p('A','',3),p('B','',3),p('C','',4),p('D','',4),p('E','',4),p('F','#',4)],
    relative: "e-minor",
  },
  {
    id: "ab-major", name: "A♭ Major", shortLabel: "Ab", mode: "major",
    tonic: p('A','b',3),
    keySignature: { sharps: [], flats: ["B","E","A","D"] },
    diatonic: [p('A','b',3),p('B','b',3),p('C','',4),p('D','b',4),p('E','b',4),p('F','',4),p('G','',4)],
    relative: "f-minor",
  },
  {
    id: "a-major", name: "A Major", shortLabel: "A", mode: "major",
    tonic: p('A','',3),
    keySignature: { sharps: ["F","C","G"], flats: [] },
    diatonic: [p('A','',3),p('B','',3),p('C','#',4),p('D','',4),p('E','',4),p('F','#',4),p('G','#',4)],
    relative: "fs-minor",
  },
  {
    id: "bb-major", name: "B♭ Major", shortLabel: "Bb", mode: "major",
    tonic: p('B','b',3),
    keySignature: { sharps: [], flats: ["B","E"] },
    diatonic: [p('B','b',3),p('C','',4),p('D','',4),p('E','b',4),p('F','',4),p('G','',4),p('A','',4)],
    relative: "g-minor",
  },
  {
    id: "b-major", name: "B Major", shortLabel: "B", mode: "major",
    tonic: p('B','',3),
    keySignature: { sharps: ["F","C","G","D","A"], flats: [] },
    diatonic: [p('B','',3),p('C','#',4),p('D','#',4),p('E','',4),p('F','#',4),p('G','#',4),p('A','#',4)],
    relative: "gs-minor",
  },
  {
    id: "c-minor", name: "C Minor", shortLabel: "Cm", mode: "minor",
    tonic: p('C','',4),
    keySignature: { sharps: [], flats: ["B","E","A"] },
    diatonic: [p('C','',4),p('D','',4),p('E','b',4),p('F','',4),p('G','',4),p('A','b',4),p('B','b',4)],
    relative: "eb-major",
  },
  {
    id: "cs-minor", name: "C# Minor", shortLabel: "C#m", mode: "minor",
    tonic: p('C','#',4),
    keySignature: { sharps: ["F","C","G","D"], flats: [] },
    diatonic: [p('C','#',4),p('D','#',4),p('E','',4),p('F','#',4),p('G','#',4),p('A','',4),p('B','',4)],
    relative: "e-major",
  },
  {
    id: "d-minor", name: "D Minor", shortLabel: "Dm", mode: "minor",
    tonic: p('D','',4),
    keySignature: { sharps: [], flats: ["B"] },
    diatonic: [p('D','',4),p('E','',4),p('F','',4),p('G','',4),p('A','',4),p('B','b',4),p('C','',5)],
    relative: "f-major",
  },
  {
    id: "eb-minor", name: "E♭ Minor", shortLabel: "Ebm", mode: "minor",
    tonic: p('E','b',4),
    keySignature: { sharps: [], flats: ["B","E","A","D","G","C"] },
    diatonic: [p('E','b',4),p('F','',4),p('G','b',4),p('A','b',4),p('B','b',4),p('C','b',5),p('D','b',5)],
    relative: "gb-major",
  },
  {
    id: "ds-minor", name: "D# Minor", shortLabel: "D#m", mode: "minor",
    tonic: p('D','#',4),
    keySignature: { sharps: ["F","C","G","D","A","E"], flats: [] },
    diatonic: [p('D','#',4),p('E','#',4),p('F','#',4),p('G','#',4),p('A','#',4),p('B','',4),p('C','#',5)],
    relative: "fs-major",
  },
  {
    id: "e-minor", name: "E Minor", shortLabel: "Em", mode: "minor",
    tonic: p('E','',4),
    keySignature: { sharps: ["F"], flats: [] },
    diatonic: [p('E','',4),p('F','#',4),p('G','',4),p('A','',4),p('B','',4),p('C','',5),p('D','',5)],
    relative: "g-major",
  },
  {
    id: "f-minor", name: "F Minor", shortLabel: "Fm", mode: "minor",
    tonic: p('F','',3),
    keySignature: { sharps: [], flats: ["B","E","A","D"] },
    diatonic: [p('F','',3),p('G','',3),p('A','b',3),p('B','b',3),p('C','',4),p('D','b',4),p('E','b',4)],
    relative: "ab-major",
  },
  {
    id: "fs-minor", name: "F# Minor", shortLabel: "F#m", mode: "minor",
    tonic: p('F','#',3),
    keySignature: { sharps: ["F","C","G"], flats: [] },
    diatonic: [p('F','#',3),p('G','#',3),p('A','',3),p('B','',3),p('C','#',4),p('D','',4),p('E','',4)],
    relative: "a-major",
  },
  {
    id: "g-minor", name: "G Minor", shortLabel: "Gm", mode: "minor",
    tonic: p('G','',3),
    keySignature: { sharps: [], flats: ["B","E"] },
    diatonic: [p('G','',3),p('A','',3),p('B','b',3),p('C','',4),p('D','',4),p('E','b',4),p('F','',4)],
    relative: "bb-major",
  },
  {
    id: "gs-minor", name: "G# Minor", shortLabel: "G#m", mode: "minor",
    tonic: p('G','#',3),
    keySignature: { sharps: ["F","C","G","D","A"], flats: [] },
    diatonic: [p('G','#',3),p('A','#',3),p('B','',3),p('C','#',4),p('D','#',4),p('E','',4),p('F','#',4)],
    relative: "b-major",
  },
  {
    id: "a-minor", name: "A Minor", shortLabel: "Am", mode: "minor",
    tonic: p('A','',3),
    keySignature: { sharps: [], flats: [] },
    diatonic: [p('A','',3),p('B','',3),p('C','',4),p('D','',4),p('E','',4),p('F','',4),p('G','',4)],
    relative: "c-major",
  },
  {
    id: "bb-minor", name: "B♭ Minor", shortLabel: "Bbm", mode: "minor",
    tonic: p('B','b',3),
    keySignature: { sharps: [], flats: ["B","E","A","D","G"] },
    diatonic: [p('B','b',3),p('C','',4),p('D','b',4),p('E','b',4),p('F','',4),p('G','b',4),p('A','b',4)],
    relative: "db-major",
  },
  {
    id: "b-minor", name: "B Minor", shortLabel: "Bm", mode: "minor",
    tonic: p('B','',3),
    keySignature: { sharps: ["F","C"], flats: [] },
    diatonic: [p('B','',3),p('C','#',4),p('D','',4),p('E','',4),p('F','#',4),p('G','',4),p('A','',4)],
    relative: "d-major",
  },
]

export interface KeyGridSlot {
  majorIds: string[]
  minorIds: string[]
  majorLabel: string
  minorLabel: string
}
export const KEY_GRID: KeyGridSlot[] = [
  { majorIds: ['c-major'],              minorIds: ['c-minor'],              majorLabel: 'C',     minorLabel: 'Cm' },
  { majorIds: ['db-major'],             minorIds: ['cs-minor'],             majorLabel: 'Db',    minorLabel: 'C#m' },
  { majorIds: ['d-major'],              minorIds: ['d-minor'],              majorLabel: 'D',     minorLabel: 'Dm' },
  { majorIds: ['eb-major'],             minorIds: ['eb-minor', 'ds-minor'], majorLabel: 'Eb',    minorLabel: 'Ebm/D#m' },
  { majorIds: ['e-major'],              minorIds: ['e-minor'],              majorLabel: 'E',     minorLabel: 'Em' },
  { majorIds: ['f-major'],              minorIds: ['f-minor'],              majorLabel: 'F',     minorLabel: 'Fm' },
  { majorIds: ['gb-major', 'fs-major'], minorIds: ['fs-minor'],             majorLabel: 'Gb/F#', minorLabel: 'F#m' },
  { majorIds: ['g-major'],              minorIds: ['g-minor'],              majorLabel: 'G',     minorLabel: 'Gm' },
  { majorIds: ['ab-major'],             minorIds: ['gs-minor'],             majorLabel: 'Ab',    minorLabel: 'G#m' },
  { majorIds: ['a-major'],              minorIds: ['a-minor'],              majorLabel: 'A',     minorLabel: 'Am' },
  { majorIds: ['bb-major'],             minorIds: ['bb-minor'],             majorLabel: 'Bb',    minorLabel: 'Bbm' },
  { majorIds: ['b-major'],              minorIds: ['b-minor'],              majorLabel: 'B',     minorLabel: 'Bm' },
]
