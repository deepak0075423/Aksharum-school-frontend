// Indian states & union territories — keep in sync with
// school-backend/utils/indiaStates.js and Nexora-Hives/utils/indiaStates.ts
export const STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa',
  'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala',
  'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland',
  'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
  'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
];

export const UNION_TERRITORIES = [
  'Andaman and Nicobar Islands', 'Chandigarh',
  'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Jammu and Kashmir',
  'Ladakh', 'Lakshadweep', 'Puducherry',
];

export const STATES_AND_UTS = [...STATES, ...UNION_TERRITORIES]
  .sort((a, b) => a.localeCompare(b));

export const isPincode = (v) => /^[1-9]\d{5}$/.test(String(v || '').trim());
