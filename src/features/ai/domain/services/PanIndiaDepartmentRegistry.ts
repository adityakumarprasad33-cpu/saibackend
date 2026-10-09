/**
 * PanIndiaDepartmentRegistry
 *
 * Centralized state-wise civic department registry for all 28 Indian States + 8 Union Territories.
 * Used by ImageRecognitionService and RunixGovAiProvider for dynamic department routing
 * based on citizen's location stateCode.
 */

export interface StateDepartmentEntry {
  agentId: string;
  agentTitle: string;
  departmentName: string;
  slaHours: number;
  helpline: string;
}

export interface StateDepartmentMap {
  roads: StateDepartmentEntry;
  water: StateDepartmentEntry;
  electricity: StateDepartmentEntry;
  sanitation: StateDepartmentEntry;
  traffic: StateDepartmentEntry;
}

/**
 * Pan-India state-wise department mapping.
 * Key = ISO-3166-2:IN 2-letter state code (e.g. 'KA', 'MH', 'DL', 'UP', 'TN', 'BR', 'WB', 'GJ', 'RJ')
 */
const STATE_DEPARTMENTS: Record<string, StateDepartmentMap> = {
  // Karnataka
  KA: {
    roads: { agentId: 'KA_PWD_Roads_Agent', agentTitle: 'Karnataka PWD Roads & Infrastructure Agent', departmentName: 'Public Works Department (PWD Karnataka)', slaHours: 48, helpline: '1800-425-0012' },
    water: { agentId: 'KA_BWSSB_Water_Agent', agentTitle: 'BWSSB Water & Pipeline Specialist Agent', departmentName: 'Bangalore Water Supply & Sewerage Board (BWSSB)', slaHours: 24, helpline: '1916' },
    electricity: { agentId: 'KA_BESCOM_Power_Agent', agentTitle: 'BESCOM Power Distribution & Emergency Agent', departmentName: 'Bangalore Electricity Supply Company (BESCOM)', slaHours: 12, helpline: '1912' },
    sanitation: { agentId: 'KA_BBMP_Sanitation_Agent', agentTitle: 'BBMP Sanitation & Solid Waste Agent', departmentName: 'Bruhat Bengaluru Mahanagara Palike (BBMP)', slaHours: 24, helpline: '1533' },
    traffic: { agentId: 'KA_Traffic_Agent', agentTitle: 'Karnataka Traffic Management & Safety Agent', departmentName: 'Bengaluru Traffic Police & BTP', slaHours: 36, helpline: '103' },
  },

  // Maharashtra
  MH: {
    roads: { agentId: 'MH_PWD_Roads_Agent', agentTitle: 'Maharashtra PWD Roads & Infrastructure Agent', departmentName: 'Public Works Department (PWD Maharashtra)', slaHours: 48, helpline: '1800-120-8040' },
    water: { agentId: 'MH_BMC_Water_Agent', agentTitle: 'BMC Water & Pipeline Specialist Agent', departmentName: 'BMC Hydraulic Engineering Dept / Maharashtra Jeevan Pradhikaran', slaHours: 24, helpline: '1916' },
    electricity: { agentId: 'MH_MSEDCL_Power_Agent', agentTitle: 'MSEDCL Power Distribution & Emergency Agent', departmentName: 'Maharashtra State Electricity Distribution Co. Ltd. (MSEDCL)', slaHours: 12, helpline: '1912' },
    sanitation: { agentId: 'MH_BMC_Sanitation_Agent', agentTitle: 'BMC Sanitation & Solid Waste Agent', departmentName: 'Brihanmumbai Municipal Corporation (BMC) Solid Waste Mgmt', slaHours: 24, helpline: '1916' },
    traffic: { agentId: 'MH_Traffic_Agent', agentTitle: 'Mumbai Traffic Management & Safety Agent', departmentName: 'Mumbai Traffic Police', slaHours: 36, helpline: '103' },
  },

  // NCT of Delhi
  DL: {
    roads: { agentId: 'DL_PWD_Roads_Agent', agentTitle: 'Delhi PWD Roads & Infrastructure Agent', departmentName: 'Public Works Department (PWD Delhi) / MCD Roads', slaHours: 48, helpline: '1800-11-0031' },
    water: { agentId: 'DL_DJB_Water_Agent', agentTitle: 'DJB Water & Pipeline Specialist Agent', departmentName: 'Delhi Jal Board (DJB)', slaHours: 24, helpline: '1916' },
    electricity: { agentId: 'DL_BSES_Power_Agent', agentTitle: 'BSES/TPDDL Power Distribution & Emergency Agent', departmentName: 'BSES Rajdhani / BSES Yamuna / Tata Power DDL', slaHours: 12, helpline: '19122' },
    sanitation: { agentId: 'DL_MCD_Sanitation_Agent', agentTitle: 'MCD Sanitation & Solid Waste Agent', departmentName: 'Municipal Corporation of Delhi (MCD)', slaHours: 24, helpline: '1031' },
    traffic: { agentId: 'DL_Traffic_Agent', agentTitle: 'Delhi Traffic Management & Safety Agent', departmentName: 'Delhi Traffic Police', slaHours: 36, helpline: '103' },
  },

  // Uttar Pradesh
  UP: {
    roads: { agentId: 'UP_PWD_Roads_Agent', agentTitle: 'UP PWD Roads & Infrastructure Agent', departmentName: 'Public Works Department (PWD Uttar Pradesh)', slaHours: 48, helpline: '1800-180-5500' },
    water: { agentId: 'UP_JalNigam_Water_Agent', agentTitle: 'UP Jal Nigam Water & Pipeline Agent', departmentName: 'Uttar Pradesh Jal Nigam', slaHours: 24, helpline: '1916' },
    electricity: { agentId: 'UP_UPPCL_Power_Agent', agentTitle: 'UPPCL Power Distribution & Emergency Agent', departmentName: 'Uttar Pradesh Power Corp. Ltd. (UPPCL / DVVNL / PVVNL)', slaHours: 12, helpline: '1912' },
    sanitation: { agentId: 'UP_NagarNigam_Sanitation_Agent', agentTitle: 'UP Nagar Nigam Sanitation & Solid Waste Agent', departmentName: 'Nagar Nigam / Nagar Palika Parishad (UP)', slaHours: 24, helpline: '1076' },
    traffic: { agentId: 'UP_Traffic_Agent', agentTitle: 'UP Traffic Management & Safety Agent', departmentName: 'UP Traffic Police', slaHours: 36, helpline: '112' },
  },

  // Tamil Nadu
  TN: {
    roads: { agentId: 'TN_Highways_Roads_Agent', agentTitle: 'TN Highways Roads & Infrastructure Agent', departmentName: 'Tamil Nadu Highways Department', slaHours: 48, helpline: '1800-425-1444' },
    water: { agentId: 'TN_CMWSSB_Water_Agent', agentTitle: 'CMWSSB Water & Pipeline Specialist Agent', departmentName: 'Chennai Metro Water Supply & Sewerage Board (CMWSSB)', slaHours: 24, helpline: '1916' },
    electricity: { agentId: 'TN_TANGEDCO_Power_Agent', agentTitle: 'TANGEDCO Power Distribution & Emergency Agent', departmentName: 'Tamil Nadu Generation & Distribution Corp. (TANGEDCO)', slaHours: 12, helpline: '1912' },
    sanitation: { agentId: 'TN_GCC_Sanitation_Agent', agentTitle: 'GCC Sanitation & Solid Waste Agent', departmentName: 'Greater Chennai Corporation (GCC)', slaHours: 24, helpline: '1913' },
    traffic: { agentId: 'TN_Traffic_Agent', agentTitle: 'TN Traffic Management & Safety Agent', departmentName: 'Tamil Nadu Traffic Police', slaHours: 36, helpline: '103' },
  },

  // Bihar
  BR: {
    roads: { agentId: 'BR_RCD_Roads_Agent', agentTitle: 'Bihar RCD Roads & Infrastructure Agent', departmentName: 'Road Construction Department (RCD Bihar)', slaHours: 48, helpline: '1800-345-6284' },
    water: { agentId: 'BR_PHED_Water_Agent', agentTitle: 'PHED Water & Pipeline Specialist Agent', departmentName: 'Public Health Engineering Dept (PHED Bihar)', slaHours: 24, helpline: '1916' },
    electricity: { agentId: 'BR_BSPHCL_Power_Agent', agentTitle: 'BSPHCL Power Distribution & Emergency Agent', departmentName: 'Bihar State Power Holding Co. Ltd. (BSPHCL)', slaHours: 12, helpline: '1912' },
    sanitation: { agentId: 'BR_PMC_Sanitation_Agent', agentTitle: 'PMC Sanitation & Solid Waste Agent', departmentName: 'Patna Municipal Corporation (PMC)', slaHours: 24, helpline: '1800-345-6284' },
    traffic: { agentId: 'BR_Traffic_Agent', agentTitle: 'Bihar Traffic Management & Safety Agent', departmentName: 'Bihar Traffic Police', slaHours: 36, helpline: '112' },
  },

  // West Bengal
  WB: {
    roads: { agentId: 'WB_PWD_Roads_Agent', agentTitle: 'WB PWD Roads & Infrastructure Agent', departmentName: 'Public Works Department (PWD West Bengal)', slaHours: 48, helpline: '1800-345-0117' },
    water: { agentId: 'WB_PHED_Water_Agent', agentTitle: 'WB PHED Water & Pipeline Agent', departmentName: 'Public Health Engineering Dept (PHED West Bengal)', slaHours: 24, helpline: '1916' },
    electricity: { agentId: 'WB_WBSEDCL_Power_Agent', agentTitle: 'WBSEDCL Power Distribution & Emergency Agent', departmentName: 'West Bengal State Electricity Distribution Co. (WBSEDCL)', slaHours: 12, helpline: '1912' },
    sanitation: { agentId: 'WB_KMC_Sanitation_Agent', agentTitle: 'KMC Sanitation & Solid Waste Agent', departmentName: 'Kolkata Municipal Corporation (KMC)', slaHours: 24, helpline: '1800-345-0117' },
    traffic: { agentId: 'WB_Traffic_Agent', agentTitle: 'WB Traffic Management & Safety Agent', departmentName: 'Kolkata Traffic Police', slaHours: 36, helpline: '103' },
  },

  // Gujarat
  GJ: {
    roads: { agentId: 'GJ_RnB_Roads_Agent', agentTitle: 'Gujarat R&B Roads & Infrastructure Agent', departmentName: 'Roads & Buildings Department (R&B Gujarat)', slaHours: 48, helpline: '1800-233-5500' },
    water: { agentId: 'GJ_GWSSB_Water_Agent', agentTitle: 'GWSSB Water & Pipeline Agent', departmentName: 'Gujarat Water Supply & Sewerage Board (GWSSB)', slaHours: 24, helpline: '1916' },
    electricity: { agentId: 'GJ_UGVCL_Power_Agent', agentTitle: 'UGVCL/PGVCL Power Distribution & Emergency Agent', departmentName: 'Uttar Gujarat Vij Co. Ltd. (UGVCL) / Paschim Gujarat (PGVCL)', slaHours: 12, helpline: '1912' },
    sanitation: { agentId: 'GJ_AMC_Sanitation_Agent', agentTitle: 'AMC Sanitation & Solid Waste Agent', departmentName: 'Ahmedabad Municipal Corporation (AMC)', slaHours: 24, helpline: '155303' },
    traffic: { agentId: 'GJ_Traffic_Agent', agentTitle: 'Gujarat Traffic Management & Safety Agent', departmentName: 'Gujarat Traffic Police', slaHours: 36, helpline: '112' },
  },

  // Rajasthan
  RJ: {
    roads: { agentId: 'RJ_PWD_Roads_Agent', agentTitle: 'Rajasthan PWD Roads & Infrastructure Agent', departmentName: 'Public Works Department (PWD Rajasthan)', slaHours: 48, helpline: '181' },
    water: { agentId: 'RJ_PHED_Water_Agent', agentTitle: 'Rajasthan PHED Water & Pipeline Agent', departmentName: 'Public Health Engineering Dept (PHED Rajasthan)', slaHours: 24, helpline: '1916' },
    electricity: { agentId: 'RJ_JVVNL_Power_Agent', agentTitle: 'JVVNL Power Distribution & Emergency Agent', departmentName: 'Jaipur Vidyut Vitran Nigam Ltd. (JVVNL)', slaHours: 12, helpline: '1912' },
    sanitation: { agentId: 'RJ_JMC_Sanitation_Agent', agentTitle: 'JMC Sanitation & Solid Waste Agent', departmentName: 'Jaipur Municipal Corporation (JMC)', slaHours: 24, helpline: '181' },
    traffic: { agentId: 'RJ_Traffic_Agent', agentTitle: 'Rajasthan Traffic Management & Safety Agent', departmentName: 'Rajasthan Traffic Police', slaHours: 36, helpline: '112' },
  },

  // Telangana
  TS: {
    roads: { agentId: 'TS_RnB_Roads_Agent', agentTitle: 'Telangana R&B Roads & Infrastructure Agent', departmentName: 'Roads & Buildings Department (Telangana)', slaHours: 48, helpline: '040-23450023' },
    water: { agentId: 'TS_HMWSSB_Water_Agent', agentTitle: 'HMWSSB Water & Pipeline Agent', departmentName: 'Hyderabad Metropolitan Water Supply & Sewerage Board (HMWSSB)', slaHours: 24, helpline: '1916' },
    electricity: { agentId: 'TS_TSSPDCL_Power_Agent', agentTitle: 'TSSPDCL Power Distribution & Emergency Agent', departmentName: 'Telangana State Southern Power Distribution Co. (TSSPDCL)', slaHours: 12, helpline: '1912' },
    sanitation: { agentId: 'TS_GHMC_Sanitation_Agent', agentTitle: 'GHMC Sanitation & Solid Waste Agent', departmentName: 'Greater Hyderabad Municipal Corporation (GHMC)', slaHours: 24, helpline: '040-21111111' },
    traffic: { agentId: 'TS_Traffic_Agent', agentTitle: 'Hyderabad Traffic Management & Safety Agent', departmentName: 'Hyderabad Traffic Police', slaHours: 36, helpline: '103' },
  },

  // Kerala
  KL: {
    roads: { agentId: 'KL_PWD_Roads_Agent', agentTitle: 'Kerala PWD Roads & Infrastructure Agent', departmentName: 'Public Works Department (PWD Kerala)', slaHours: 48, helpline: '1800-425-1550' },
    water: { agentId: 'KL_KWA_Water_Agent', agentTitle: 'KWA Water & Pipeline Agent', departmentName: 'Kerala Water Authority (KWA)', slaHours: 24, helpline: '1916' },
    electricity: { agentId: 'KL_KSEB_Power_Agent', agentTitle: 'KSEB Power Distribution & Emergency Agent', departmentName: 'Kerala State Electricity Board (KSEB)', slaHours: 12, helpline: '1912' },
    sanitation: { agentId: 'KL_Corp_Sanitation_Agent', agentTitle: 'Corporation Sanitation & Solid Waste Agent', departmentName: 'Corporation of Cochin / Thiruvananthapuram / Kozhikode', slaHours: 24, helpline: '1800-425-1550' },
    traffic: { agentId: 'KL_Traffic_Agent', agentTitle: 'Kerala Traffic Management & Safety Agent', departmentName: 'Kerala Motor Vehicles Dept & Traffic Police', slaHours: 36, helpline: '112' },
  },

  // Andhra Pradesh
  AP: {
    roads: { agentId: 'AP_RnB_Roads_Agent', agentTitle: 'AP R&B Roads & Infrastructure Agent', departmentName: 'Roads & Buildings Department (Andhra Pradesh)', slaHours: 48, helpline: '1902' },
    water: { agentId: 'AP_RWS_Water_Agent', agentTitle: 'AP RWS Water & Pipeline Agent', departmentName: 'Rural Water Supply (RWS) / GVMC Water Wing', slaHours: 24, helpline: '1916' },
    electricity: { agentId: 'AP_APSPDCL_Power_Agent', agentTitle: 'APSPDCL Power Distribution & Emergency Agent', departmentName: 'AP Southern Power Distribution Co. (APSPDCL)', slaHours: 12, helpline: '1912' },
    sanitation: { agentId: 'AP_VMC_Sanitation_Agent', agentTitle: 'AP Municipal Corp Sanitation Agent', departmentName: 'GVMC Visakhapatnam / VMC Vijayawada', slaHours: 24, helpline: '1902' },
    traffic: { agentId: 'AP_Traffic_Agent', agentTitle: 'AP Traffic Management & Safety Agent', departmentName: 'AP Traffic Police', slaHours: 36, helpline: '112' },
  },

  // Punjab
  PB: {
    roads: { agentId: 'PB_PWD_Roads_Agent', agentTitle: 'Punjab PWD Roads & Infrastructure Agent', departmentName: 'Public Works Department (PWD Punjab)', slaHours: 48, helpline: '1800-180-1551' },
    water: { agentId: 'PB_PWSSB_Water_Agent', agentTitle: 'PWSSB Water & Pipeline Agent', departmentName: 'Punjab Water Supply & Sewerage Board (PWSSB)', slaHours: 24, helpline: '1916' },
    electricity: { agentId: 'PB_PSPCL_Power_Agent', agentTitle: 'PSPCL Power Distribution & Emergency Agent', departmentName: 'Punjab State Power Corp. Ltd. (PSPCL)', slaHours: 12, helpline: '1912' },
    sanitation: { agentId: 'PB_MC_Sanitation_Agent', agentTitle: 'MC Sanitation & Solid Waste Agent', departmentName: 'Municipal Corporation (Ludhiana/Amritsar/Jalandhar)', slaHours: 24, helpline: '1800-180-1551' },
    traffic: { agentId: 'PB_Traffic_Agent', agentTitle: 'Punjab Traffic Management & Safety Agent', departmentName: 'Punjab Traffic Police', slaHours: 36, helpline: '112' },
  },

  // Madhya Pradesh
  MP: {
    roads: { agentId: 'MP_PWD_Roads_Agent', agentTitle: 'MP PWD Roads & Infrastructure Agent', departmentName: 'Public Works Department (PWD Madhya Pradesh)', slaHours: 48, helpline: '181' },
    water: { agentId: 'MP_PHED_Water_Agent', agentTitle: 'MP PHED Water & Pipeline Agent', departmentName: 'Public Health Engineering Dept (PHED Madhya Pradesh)', slaHours: 24, helpline: '1916' },
    electricity: { agentId: 'MP_MPMKVVCL_Power_Agent', agentTitle: 'MPMKVVCL Power Distribution Agent', departmentName: 'MP Madhya Kshetra Vidyut Vitaran Co. (MPMKVVCL)', slaHours: 12, helpline: '1912' },
    sanitation: { agentId: 'MP_BMC_Sanitation_Agent', agentTitle: 'BMC Sanitation & Solid Waste Agent', departmentName: 'Bhopal Municipal Corporation (BMC)', slaHours: 24, helpline: '181' },
    traffic: { agentId: 'MP_Traffic_Agent', agentTitle: 'MP Traffic Management & Safety Agent', departmentName: 'MP Traffic Police', slaHours: 36, helpline: '112' },
  },
};

/**
 * Default/generic department entries for states not explicitly mapped.
 * Uses Pan-India central ministry naming.
 */
const DEFAULT_DEPARTMENTS: StateDepartmentMap = {
  roads: { agentId: 'GENERIC_PWD_Roads_Agent', agentTitle: 'State PWD Roads & Infrastructure Agent', departmentName: 'Public Works Department (State PWD)', slaHours: 48, helpline: '1800-11-0031' },
  water: { agentId: 'GENERIC_PHED_Water_Agent', agentTitle: 'State PHED Water & Pipeline Agent', departmentName: 'Public Health Engineering Dept (State PHED)', slaHours: 24, helpline: '1916' },
  electricity: { agentId: 'GENERIC_Discom_Power_Agent', agentTitle: 'State Discom Power Distribution Agent', departmentName: 'State Electricity Distribution Company (Discom)', slaHours: 12, helpline: '1912' },
  sanitation: { agentId: 'GENERIC_ULB_Sanitation_Agent', agentTitle: 'Municipal Corp Sanitation & Solid Waste Agent', departmentName: 'Urban Local Body / Municipal Corporation', slaHours: 24, helpline: '1969' },
  traffic: { agentId: 'GENERIC_Traffic_Agent', agentTitle: 'State Traffic Management & Safety Agent', departmentName: 'State Traffic Police', slaHours: 36, helpline: '112' },
};

export type CivicDefectCategory = 'roads' | 'water' | 'electricity' | 'sanitation' | 'traffic';

export class PanIndiaDepartmentRegistry {
  /**
   * Get the department entry for a specific state and defect category.
   */
  public static getDepartment(stateCode: string, category: CivicDefectCategory): StateDepartmentEntry {
    const upperCode = (stateCode || '').toUpperCase().trim();
    const stateMap = STATE_DEPARTMENTS[upperCode] || DEFAULT_DEPARTMENTS;
    return stateMap[category] || DEFAULT_DEPARTMENTS[category];
  }

  /**
   * Get all department entries for a state.
   */
  public static getStateDepartments(stateCode: string): StateDepartmentMap {
    const upperCode = (stateCode || '').toUpperCase().trim();
    return STATE_DEPARTMENTS[upperCode] || DEFAULT_DEPARTMENTS;
  }

  /**
   * Classify defect category from visual description text.
   * Returns the most likely civic defect category based on keyword analysis.
   */
  public static classifyDefectCategory(visualDescription: string): { category: CivicDefectCategory; defectType: string; priority: string } {
    const text = (visualDescription || '').toLowerCase();

    if (text.includes('water') || text.includes('pipe') || text.includes('drain') || text.includes('flood') || text.includes('leak') || text.includes('sewage') || text.includes('sewer') || text.includes('tap')) {
      return { category: 'water', defectType: 'water_pipeline_issue', priority: 'Urgent' };
    }

    if (text.includes('electric') || text.includes('wire') || text.includes('cable') || text.includes('spark') || text.includes('pole') || text.includes('transformer') || text.includes('power') || text.includes('voltage') || text.includes('streetlight') || text.includes('light')) {
      return { category: 'electricity', defectType: 'electrical_hazard', priority: 'Critical' };
    }

    if (text.includes('garbage') || text.includes('trash') || text.includes('waste') || text.includes('dump') || text.includes('sanitat') || text.includes('debris') || text.includes('litter') || text.includes('compost') || text.includes('stench') || text.includes('smell') || text.includes('rubbish')) {
      return { category: 'sanitation', defectType: 'garbage_overflow', priority: 'High' };
    }

    if (text.includes('traffic') || text.includes('signal') || text.includes('congestion') || text.includes('parking') || text.includes('bus stop') || text.includes('zebra') || text.includes('divider') || text.includes('speed breaker')) {
      return { category: 'traffic', defectType: 'traffic_safety_issue', priority: 'Medium' };
    }

    // Default: roads/infrastructure
    return { category: 'roads', defectType: 'road_infrastructure_damage', priority: 'High' };
  }

  /**
   * Full classification: visual description + state code → complete department routing.
   */
  public static classifyAndRoute(visualDescription: string, stateCode: string): {
    category: CivicDefectCategory;
    defectType: string;
    priority: string;
    department: StateDepartmentEntry;
  } {
    const { category, defectType, priority } = this.classifyDefectCategory(visualDescription);
    const department = this.getDepartment(stateCode, category);
    return { category, defectType, priority, department };
  }

  /**
   * Returns a human-readable category label.
   */
  public static getCategoryLabel(category: CivicDefectCategory): string {
    const labels: Record<CivicDefectCategory, string> = {
      roads: 'Infrastructure & Roads',
      water: 'Water Supply & Drainage',
      electricity: 'Electricity & Power',
      sanitation: 'Sanitation & Garbage Disposal',
      traffic: 'Public Transport & Traffic',
    };
    return labels[category] || 'Infrastructure & Roads';
  }
}
