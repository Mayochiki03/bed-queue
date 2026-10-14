/**
 * WidgetView — แสดงผลลัพธ์ของ widget ตามรูปแบบที่เลือก (ใช้ทั้งบนหน้า Dashboard และใน preview ของตัวสร้าง)
 */
import type { WidgetResult } from '../../api/dashboardApi';
import { GROUP_LABEL, type ChartType, type Group } from '../../lib/widgetRules';
import { ColumnChart, DonutChart, HBarChart, LineChart, NumberView, ResultTable, TilesView } from './charts';

export function WidgetView({ chart, group_by, result }: { chart: ChartType; group_by: Group; result: WidgetResult }) {
  switch (chart) {
    case 'number':
      return <NumberView result={result} />;
    case 'tiles':
      return <TilesView result={result} />;
    case 'bar':
      return <ColumnChart result={result} />;
    case 'hbar':
      return <HBarChart result={result} />;
    case 'line':
      return <LineChart result={result} />;
    case 'donut':
      return <DonutChart result={result} />;
    case 'table':
      return <ResultTable result={result} headerLabel={GROUP_LABEL[group_by]} />;
  }
}
