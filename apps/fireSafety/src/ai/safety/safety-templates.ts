type Language = 'en' | 'ur';

export type SafetyTemplateRole = 'firefighter' | 'civilian';

export interface SafetyTemplateContext {
  level: 'global' | 'society' | 'building';
  buildingName?: string;
  societyName?: string;
  activeCount: number;
  criticalCount: number;
  criticalBuildings?: number;
}

const ENGLISH_TEMPLATES = {
  firefighter: {
    building: (ctx: SafetyTemplateContext) =>
      `Emergency status: critical hazard confirmed in ${
        ctx.buildingName || 'the target building'
      }. Active incidents ${ctx.activeCount}, high-severity ${ctx.criticalCount}. Execute immediate tactical containment and evacuation support.`,
    society: (ctx: SafetyTemplateContext) =>
      `Emergency status: society-level escalation in ${
        ctx.societyName || 'the target society'
      }. Critical buildings ${ctx.criticalBuildings || 0}, active incidents ${
        ctx.activeCount
      }. Prioritize cross-building command coordination.`,
    global: (ctx: SafetyTemplateContext) =>
      `Emergency status: global high-severity load detected. Active incidents ${ctx.activeCount}, high-severity ${ctx.criticalCount}. Activate broad tactical readiness and regional coordination.`,
  },
  civilian: {
    building: (ctx: SafetyTemplateContext) =>
      `Emergency. Leave ${
        ctx.buildingName || 'this building'
      } now using the nearest safe exit. Avoid elevators and smoke zones. Follow firefighter instructions.`,
    society: (ctx: SafetyTemplateContext) =>
      `Emergency in ${ctx.societyName || 'your society'}. Move to a safe open assembly area immediately and keep evacuation routes clear.`,
    global: () =>
      'Emergency alert. Follow official evacuation guidance immediately, stay calm, and avoid blocked routes.',
  },
};

const URDU_TEMPLATES = {
  firefighter: {
    building: (ctx: SafetyTemplateContext) =>
      `ایمرجنسی اسٹیٹس: ${
        ctx.buildingName || 'متعلقہ عمارت'
      } میں شدید خطرہ کنفرم ہے۔ فعال واقعات ${ctx.activeCount} اور ہائی سیوریٹی ${ctx.criticalCount} ہیں۔ فوری ٹیکٹیکل کنٹینمنٹ اور انخلا سپورٹ کریں۔`,
    society: (ctx: SafetyTemplateContext) =>
      `ایمرجنسی اسٹیٹس: ${
        ctx.societyName || 'متعلقہ سوسائٹی'
      } میں سوسائٹی لیول بڑھا ہوا خطرہ ہے۔ کریٹیکل بلڈنگز ${
        ctx.criticalBuildings || 0
      } اور فعال واقعات ${ctx.activeCount} ہیں۔ کراس بلڈنگ کمانڈ کو ترجیح دیں۔`,
    global: (ctx: SafetyTemplateContext) =>
      `ایمرجنسی اسٹیٹس: عالمی سطح پر ہائی سیوریٹی لوڈ موجود ہے۔ فعال واقعات ${ctx.activeCount} اور ہائی سیوریٹی ${ctx.criticalCount} ہیں۔ وسیع ٹیکٹیکل ریڈینس فوری فعال کریں۔`,
  },
  civilian: {
    building: (ctx: SafetyTemplateContext) =>
      `ایمرجنسی۔ ${
        ctx.buildingName || 'اس عمارت'
      } سے فوراً قریب ترین محفوظ راستے سے باہر نکلیں۔ لفٹ استعمال نہ کریں اور دھویں والے علاقوں سے دور رہیں۔`,
    society: (ctx: SafetyTemplateContext) =>
      `ایمرجنسی الرٹ: ${
        ctx.societyName || 'آپ کی سوسائٹی'
      } میں خطرہ ہے۔ فوراً محفوظ کھلی جگہ میں پہنچیں اور انخلا کے راستے خالی رکھیں۔`,
    global: () =>
      'ایمرجنسی الرٹ۔ سرکاری انخلا ہدایات پر فوراً عمل کریں، پرسکون رہیں، اور بند راستوں سے بچیں۔',
  },
};

export function buildSafetyTemplate(
  role: SafetyTemplateRole,
  language: Language,
  context: SafetyTemplateContext,
): string {
  const bank = language === 'ur' ? URDU_TEMPLATES : ENGLISH_TEMPLATES;
  const byRole = bank[role];
  return byRole[context.level](context);
}
