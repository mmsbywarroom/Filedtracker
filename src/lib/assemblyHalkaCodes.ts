/** Halka (assembly) name → export CSV file code (without .csv). */

function normalizeAssemblyName(raw: string) {
  return String(raw || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/sahibzada\s+ajit\s+singh\s+nagar/g, "sas nagar")
    .replace(/\bs\.?\s*a\.?\s*s\.?\s*nagar\b/g, "sas nagar")
    .replace(/\bcantt\.?\b/g, "cantt")
    .replace(/\bcantonment\b/g, "cantt")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\bsc\b|\bst\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** App assembly spellings → normalized halka key in HALKA_EXPORT_CODES */
const ASSEMBLY_ALIASES: Record<string, string> = {
  "jalandhar cantt": "jalandhar cantt",
  "jalandhar cantt.": "jalandhar cantt",
  "jalandhar cantonment": "jalandhar cantt",
  mohali: "sas nagar",
  "sas nagar": "sas nagar",
  "s a s nagar": "sas nagar",
  "s.a.s.nagar": "sas nagar",
  bhatinda: "bathinda urban",
  "bhatinda urban": "bathinda urban",
  bathinda: "bathinda urban",
  firozepur: "firozpur city",
  firozpur: "firozpur city",
  ropar: "rupnagar",
  nawanshahr: "nawan shahr",
};

export const HALKA_EXPORT_CODES: { halka: string; code: string }[] = [
  { halka: "Mukerian", code: "DB_HR_Mukerian" },
  { halka: "Sham Chaurasi", code: "DB_HR_Sham Chaurasi" },
  { halka: "Urmar", code: "DB_HR_Urmar" },
  { halka: "Chabbewal", code: "DB_HU_Chabbewal" },
  { halka: "Dasuya", code: "DB_HU_Dasuya" },
  { halka: "Garhshankar", code: "DB_HU_Garhshankar" },
  { halka: "Hoshiarpur", code: "DB_HU_Hoshiarpur" },
  { halka: "Adampur", code: "DB_JR_Adampur" },
  { halka: "Kartarpur", code: "DB_JR_Kartarpur" },
  { halka: "Nakodar", code: "DB_JR_Nakodar" },
  { halka: "Phillaur", code: "DB_JR_Phillaur" },
  { halka: "Shahkot", code: "DB_JR_Shahkot" },
  { halka: "Jalandhar Cantt", code: "DB_JU_Jalandhar Cantt" },
  { halka: "Jalandhar Central", code: "DB_JU_Jalandhar Central" },
  { halka: "Jalandhar North", code: "DB_JU_Jalandhar North" },
  { halka: "Jalandhar West", code: "DB_JU_Jalandhar West" },
  { halka: "Bholath", code: "DB_KAP_Bholath" },
  { halka: "Kapurthala", code: "DB_KAP_Kapurthala" },
  { halka: "Phagwara", code: "DB_KAP_Phagwara" },
  { halka: "Sultanpur Lodhi", code: "DB_KAP_Sultanpur Lodhi" },
  { halka: "Balachaur", code: "DB_SBS_Balachaur" },
  { halka: "Banga", code: "DB_SBS_Banga" },
  { halka: "Nawan Shahr", code: "DB_SBS_Nawan Shahr" },
  { halka: "Ajnala", code: "MJ_AR_Ajnala" },
  { halka: "Attari", code: "MJ_AR_Attari" },
  { halka: "Baba Bakala", code: "MJ_AR_Baba Bakala" },
  { halka: "Jandiala", code: "MJ_AR_Jandiala" },
  { halka: "Majitha", code: "MJ_AR_Majitha" },
  { halka: "Raja Sansi", code: "MJ_AR_Raja Sansi" },
  { halka: "Amritsar Central", code: "MJ_AU_Amritsar Central" },
  { halka: "Amritsar East", code: "MJ_AU_Amritsar East" },
  { halka: "Amritsar North", code: "MJ_AU_Amritsar North" },
  { halka: "Amritsar South", code: "MJ_AU_Amritsar South" },
  { halka: "Amritsar West", code: "MJ_AU_Amritsar West" },
  { halka: "Batala", code: "MJ_GUR_Batala" },
  { halka: "Dera Baba Nanak", code: "MJ_GUR_Dera Baba Nanak" },
  { halka: "Dina Nagar", code: "MJ_GUR_Dina Nagar" },
  { halka: "Fatehgarh Churian", code: "MJ_GUR_Fatehgarh Churian" },
  { halka: "Gurdaspur", code: "MJ_GUR_Gurdaspur" },
  { halka: "Qadian", code: "MJ_GUR_Qadian" },
  { halka: "Sri Hargobindpur", code: "MJ_GUR_Sri Hargobindpur" },
  { halka: "Bhoa", code: "MJ_PAT_Bhoa" },
  { halka: "Pathankot", code: "MJ_PAT_Pathankot" },
  { halka: "Sujanpur", code: "MJ_PAT_Sujanpur" },
  { halka: "Khadoor Sahib", code: "MJ_TT_Khadoor Sahib" },
  { halka: "Khem Karan", code: "MJ_TT_Khem Karan" },
  { halka: "Patti", code: "MJ_TT_Patti" },
  { halka: "Tarn Taran", code: "MJ_TT_Tarn Taran" },
  { halka: "Faridkot", code: "MC_FAR_Faridkot" },
  { halka: "Jaitu", code: "MC_FAR_Jaitu" },
  { halka: "Kotkapura", code: "MC_FAR_Kotkapura" },
  { halka: "Amloh", code: "MC_FS_Amloh" },
  { halka: "Bassi Pathana", code: "MC_FS_Bassi Pathana" },
  { halka: "Fatehgarh Sahib", code: "MC_FS_Fatehgarh Sahib" },
  { halka: "Dakha", code: "MC_LR1_Dakha" },
  { halka: "Gill", code: "MC_LR1_Gill" },
  { halka: "Jagraon", code: "MC_LR1_Jagraon" },
  { halka: "Raikot", code: "MC_LR1_Raikot" },
  { halka: "Khanna", code: "MC_LR2_Khanna" },
  { halka: "Payal", code: "MC_LR2_Payal" },
  { halka: "Sahnewal", code: "MC_LR2_Sahnewal" },
  { halka: "Samrala", code: "MC_LR2_Samrala" },
  { halka: "Atam Nagar", code: "MC_LU_Atam Nagar" },
  { halka: "Ludhiana Central", code: "MC_LU_Ludhiana Central" },
  { halka: "Ludhiana East", code: "MC_LU_Ludhiana East" },
  { halka: "Ludhiana North", code: "MC_LU_Ludhiana North" },
  { halka: "Ludhiana South", code: "MC_LU_Ludhiana South" },
  { halka: "Ludhiana West", code: "MC_LU_Ludhiana West" },
  { halka: "Bhagha Purana", code: "MC_MG_Bhagha Purana" },
  { halka: "Dharamkot", code: "MC_MG_Dharamkot" },
  { halka: "Moga", code: "MC_MG_Moga" },
  { halka: "Nihal Singhwala", code: "MC_MG_Nihal Singhwala" },
  { halka: "Amargarh", code: "ME_MAL_Amargarh" },
  { halka: "Malerkotla", code: "ME_MAL_Malerkotla" },
  { halka: "Ghanaur", code: "ME_PR_Ghanaur" },
  { halka: "Nabha", code: "ME_PR_Nabha" },
  { halka: "Patiala Rural", code: "ME_PR_Patiala Rural" },
  { halka: "Rajpura", code: "ME_PR_Rajpura" },
  { halka: "Patiala", code: "ME_PU_Patiala" },
  { halka: "Samana", code: "ME_PU_Samana" },
  { halka: "Sanour", code: "ME_PU_Sanour" },
  { halka: "Shutrana", code: "ME_PU_Shutrana" },
  { halka: "Anandpur Sahib", code: "ME_RP_Anandpur Sahib" },
  { halka: "Chamkaur Sahib", code: "ME_RP_Chamkaur Sahib" },
  { halka: "Rupnagar", code: "ME_RP_Rupnagar" },
  { halka: "Dhuri", code: "ME_SAN_Dhuri" },
  { halka: "Dirba", code: "ME_SAN_Dirba" },
  { halka: "Lehra", code: "ME_SAN_Lehra" },
  { halka: "Sangrur", code: "ME_SAN_Sangrur" },
  { halka: "Sunam", code: "ME_SAN_Sunam" },
  { halka: "Dera Bassi", code: "ME_SAS_Dera Bassi" },
  { halka: "Kharar", code: "ME_SAS_Kharar" },
  { halka: "S.A.S. Nagar", code: "ME_SAS_S.A.S. Nagar" },
  { halka: "Barnala", code: "MW_BAR_Barnala" },
  { halka: "Bhadaur", code: "MW_BAR_Bhadaur" },
  { halka: "Mehal Kalan", code: "MW_BAR_Mehal Kalan" },
  { halka: "Bathinda Rural", code: "MW_BAT_Bathinda Rural" },
  { halka: "Bathinda Urban", code: "MW_BAT_Bathinda Urban" },
  { halka: "Bhucho Mandi", code: "MW_BAT_Bhucho Mandi" },
  { halka: "Maur", code: "MW_BAT_Maur" },
  { halka: "Rampura Phul", code: "MW_BAT_Rampura Phul" },
  { halka: "Talwandi Sabo", code: "MW_BAT_Talwandi Sabo" },
  { halka: "Abohar", code: "MW_FAZ_Abohar" },
  { halka: "Balluana", code: "MW_FAZ_Balluana" },
  { halka: "Fazilka", code: "MW_FAZ_Fazilka" },
  { halka: "Jalalabad", code: "MW_FAZ_Jalalabad" },
  { halka: "Firozpur City", code: "MW_FIR_Firozpur City" },
  { halka: "Firozpur Rural", code: "MW_FIR_Firozpur Rural" },
  { halka: "Guru Har Sahai", code: "MW_FIR_Guru Har Sahai" },
  { halka: "Zira", code: "MW_FIR_Zira" },
  { halka: "Budhlada", code: "MW_MAN_Budhlada" },
  { halka: "Mansa", code: "MW_MAN_Mansa" },
  { halka: "Sardulgarh", code: "MW_MAN_Sardulgarh" },
  { halka: "Gidderbaha", code: "MW_SMS_Gidderbaha" },
  { halka: "Lambi", code: "MW_SMS_Lambi" },
  { halka: "Malout", code: "MW_SMS_Malout" },
  { halka: "Muktsar", code: "MW_SMS_Muktsar" },
];

const codeByNorm = new Map<string, string>();
for (const { halka, code } of HALKA_EXPORT_CODES) {
  codeByNorm.set(normalizeAssemblyName(halka), code);
}

/** Map admin assembly name to export CSV base name (code). */
export function assemblyExportCode(assemblyName: string): string | null {
  let norm = normalizeAssemblyName(assemblyName);
  const alias = ASSEMBLY_ALIASES[norm];
  if (alias) norm = alias;

  const direct = codeByNorm.get(norm);
  if (direct) return direct;

  return null;
}

export function assemblyExportFileName(assemblyName: string, ext: "csv" | "pdf" = "csv"): string {
  const code = assemblyExportCode(assemblyName);
  if (code) return `${code}.${ext}`;
  const safe = String(assemblyName || "Unknown")
    .replace(/[^\w\s.-]+/g, "")
    .trim()
    .replace(/\s+/g, "_");
  return `UNMAPPED_${safe || "Unknown"}.${ext}`;
}
