import type { CompatibilityItem, CompatibilityReport } from './types';

export function buildReport(items: CompatibilityItem[]): CompatibilityReport {
  return {
    items,
    supportedCount: items.filter((i) => i.severity === 'supported').length,
    convertedCount: items.filter((i) => i.severity === 'converted').length,
    unsupportedCount: items.filter((i) => i.severity === 'unsupported').length,
  };
}
