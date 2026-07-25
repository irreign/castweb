import type { SGSchool } from './models';

/**
 * Illustrative sample coordinates for demo purposes — not verified against MOE/OneMap.
 * A real build should pull this from MOE's school directory or the OneMap API.
 */
export const SCHOOLS: SGSchool[] = [
  { id: 'ai-tong', name: 'Ai Tong School', area: 'Bright Hill', location: { lat: 1.3597, lon: 103.8339 } },
  { id: 'rosyth', name: 'Rosyth School', area: 'Serangoon North', location: { lat: 1.362, lon: 103.872 } },
  { id: 'nan-hua', name: 'Nan Hua Primary School', area: 'Clementi', location: { lat: 1.3175, lon: 103.7793 } },
  { id: 'nanyang', name: 'Nanyang Primary School', area: 'Bukit Timah', location: { lat: 1.3138, lon: 103.8078 } },
  { id: 'tao-nan', name: 'Tao Nan School', area: 'Marine Parade', location: { lat: 1.3086, lon: 103.9036 } },
  { id: 'henry-park', name: 'Henry Park Primary School', area: 'Holland', location: { lat: 1.3145, lon: 103.7847 } },
  {
    id: 'catholic-high',
    name: 'Catholic High School (Primary)',
    area: 'Bishan',
    location: { lat: 1.3567, lon: 103.8508 },
  },
  {
    id: 'pei-hwa',
    name: 'Pei Hwa Presbyterian Primary School',
    area: 'Bukit Timah',
    location: { lat: 1.3423, lon: 103.7913 },
  },
  {
    id: 'acs-primary',
    name: 'Anglo-Chinese School (Primary)',
    area: 'Novena',
    location: { lat: 1.3277, lon: 103.8377 },
  },
  { id: 'st-hildas', name: "St. Hilda's Primary School", area: 'Tampines', location: { lat: 1.3496, lon: 103.9391 } },
];
