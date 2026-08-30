// GST State codes (first 2 digits of GSTIN). Source: GST state code list.
export const STATE_CODES: Record<string, string> = {
  '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh',
  '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh',
  '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur',
  '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal',
  '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat',
  '25': 'Daman and Diu', '26': 'Dadra and Nagar Haveli', '27': 'Maharashtra', '28': 'Andhra Pradesh (Old)',
  '29': 'Karnataka', '30': 'Goa', '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu',
  '34': 'Puducherry', '35': 'Andaman and Nicobar Islands', '36': 'Telangana', '37': 'Andhra Pradesh',
  '38': 'Ladakh', '97': 'Other Territory', '99': 'Centre Jurisdiction',
};

// Reverse map: state name -> code
export const STATE_NAME_TO_CODE: Record<string, string> = Object.entries(STATE_CODES).reduce(
  (acc, [code, name]) => { acc[name.toLowerCase()] = code; return acc; }, {} as Record<string, string>
);

export const INDIAN_STATES = Object.values(STATE_CODES).filter((s) => !s.includes('(Old)') && !['Centre Jurisdiction'].includes(s)).sort();

export function stateCodeFromGstin(gstin?: string): string | null {
  if (!gstin || gstin.length < 2) return null;
  const code = gstin.slice(0, 2);
  return STATE_CODES[code] ? code : null;
}

export function stateNameFromGstin(gstin?: string): string | null {
  const code = stateCodeFromGstin(gstin);
  return code ? STATE_CODES[code] : null;
}

export function codeForStateName(name?: string): string | null {
  if (!name) return null;
  return STATE_NAME_TO_CODE[name.trim().toLowerCase()] ?? null;
}
