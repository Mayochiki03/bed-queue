/**
 * core/xlsxCharts.ts — ใส่ "กราฟจริงของ Excel" (แท่ง/เส้น/วงกลม) ลงในไฟล์ .xlsx ที่ exceljs สร้างไว้แล้ว
 *
 * exceljs วาดกราฟเองไม่ได้ จึงเปิดไฟล์ (.xlsx คือ zip) แล้วเติมส่วนของกราฟ (drawing + chart XML) ให้ตามมาตรฐาน OOXML
 * กราฟอ้างอิงช่วงเซลล์ในชีตจริง → ผู้ใช้แก้ตัวเลขใน Excel แล้วกราฟเปลี่ยนตาม · มีค่าสำรอง (cache) ไว้ให้โปรแกรมที่ไม่คำนวณใหม่ (เช่น ตัวดูตัวอย่างไฟล์) แสดงผลได้
 *
 *   const out = await injectCharts(buffer, [{ sheet: 'สรุป', kind: 'col', title: '...', catRef: "'สรุป'!$A$5:$A$9", cats: [...], series: [...], anchor: { col: 6, row: 3, cols: 8, rows: 16 } }]);
 */
import JSZip from 'jszip';

export type ChartSeries = {
  name: string;
  /** อ้างชื่อชุดข้อมูลจากเซลล์ (เช่น หัวคอลัมน์) — ไม่ใส่ = ใช้ชื่อตรง ๆ */
  nameRef?: string;
  valRef: string;
  values: (number | null)[];
  /** สีของชุดข้อมูล (hex 6 หลักไม่มี #) */
  color?: string;
  /** วงกลม/แท่งสีต่อจุด */
  pointColors?: string[];
};

export type ChartSpec = {
  sheet: string;
  kind: 'col' | 'bar' | 'line' | 'pie' | 'doughnut';
  title: string;
  stacked?: boolean;
  catRef: string;
  cats: string[];
  series: ChartSeries[];
  /** ตำแหน่งบนชีต (เริ่มนับ 0): คอลัมน์/แถวมุมซ้ายบน และความกว้าง/สูงเป็นจำนวนคอลัมน์/แถว */
  anchor: { col: number; row: number; cols: number; rows: number };
  valueTitle?: string;
  /** แสดงตัวเลขบนแท่ง/ชิ้นวงกลม (ค่าเริ่มต้น: เปิดถ้าหมวดไม่เกิน 14) */
  labels?: boolean;
};

export const PALETTE = ['2A78D6', '1BAF7A', 'D98A1C', '7C5CD6', 'D4476B', '64748B', '0F6F78', '9A6B2F'];

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** อ้างอิงช่วงเซลล์: quoteRef('สรุป', 'A1:A5') -> 'สรุป'!$A$1:$A$5 */
export function ref(sheet: string, a1: string): string {
  const abs = a1
    .split(':')
    .map((p) => p.replace(/([A-Z]+)(\d+)/, '$$$1$$$2'))
    .join(':');
  return `'${sheet.replace(/'/g, "''")}'!${abs}`;
}

const strCache = (vals: string[]) => `<c:strCache><c:ptCount val="${vals.length}"/>${vals.map((v, i) => `<c:pt idx="${i}"><c:v>${esc(v)}</c:v></c:pt>`).join('')}</c:strCache>`;
const numCache = (vals: (number | null)[]) => `<c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${vals.length}"/>${vals.map((v, i) => (v === null ? '' : `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`)).join('')}</c:numCache>`;
const fill = (hex: string) => `<a:solidFill><a:srgbClr val="${hex}"/></a:solidFill>`;
const txPr = (sz: number, bold = false, color = '475569') => `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="${sz}" b="${bold ? 1 : 0}">${fill(color)}<a:latin typeface="Tahoma"/><a:cs typeface="Tahoma"/></a:defRPr></a:pPr><a:endParaRPr lang="th-TH"/></a:p></c:txPr>`;
const dLbls = (percent: boolean) =>
  `<c:dLbls><c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>${txPr(900, true, '1E293B')}<c:showLegendKey val="0"/><c:showVal val="1"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="${percent ? 1 : 0}"/><c:showBubbleSize val="0"/>${percent ? '<c:separator> · </c:separator>' : ''}</c:dLbls>`;

function seriesXml(c: ChartSpec, s: ChartSeries, i: number): string {
  const color = s.color ?? PALETTE[i % PALETTE.length]!;
  const tx = `<c:tx>${s.nameRef ? `<c:strRef><c:f>${esc(s.nameRef)}</c:f>${strCache([s.name])}</c:strRef>` : `<c:v>${esc(s.name)}</c:v>`}</c:tx>`;
  const cat = `<c:cat><c:strRef><c:f>${esc(c.catRef)}</c:f>${strCache(c.cats)}</c:strRef></c:cat>`;
  const val = `<c:val><c:numRef><c:f>${esc(s.valRef)}</c:f>${numCache(s.values)}</c:numRef></c:val>`;
  const showLabels = c.labels ?? c.cats.length <= 14;
  const head = `<c:idx val="${i}"/><c:order val="${i}"/>${tx}`;
  if (c.kind === 'pie' || c.kind === 'doughnut') {
    const pts = c.cats.map((_, k) => `<c:dPt><c:idx val="${k}"/><c:bubble3D val="0"/><c:spPr>${fill(s.pointColors?.[k] ?? PALETTE[k % PALETTE.length]!)}<a:ln w="19050"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:ln></c:spPr></c:dPt>`).join('');
    return `<c:ser>${head}${pts}${showLabels ? dLbls(true) : ''}${cat}${val}</c:ser>`;
  }
  if (c.kind === 'line') {
    return `<c:ser>${head}<c:spPr><a:ln w="28575" cap="rnd">${fill(color)}<a:round/></a:ln></c:spPr><c:marker><c:symbol val="circle"/><c:size val="5"/><c:spPr>${fill(color)}<a:ln w="9525">${fill('FFFFFF')}</a:ln></c:spPr></c:marker>${cat}${val}<c:smooth val="0"/></c:ser>`;
  }
  // แท่ง: ชุดเดียวที่มีสีต่อจุด (เช่น สีตามระดับผู้ป่วย) ใส่ dPt ให้
  const pts = s.pointColors ? c.cats.map((_, k) => (s.pointColors![k] ? `<c:dPt><c:idx val="${k}"/><c:invertIfNegative val="0"/><c:bubble3D val="0"/><c:spPr>${fill(s.pointColors![k]!)}</c:spPr></c:dPt>` : '')).join('') : '';
  return `<c:ser>${head}<c:spPr>${fill(color)}</c:spPr><c:invertIfNegative val="0"/>${pts}${showLabels && !c.stacked ? dLbls(false) : ''}${cat}${val}</c:ser>`;
}

function axesXml(c: ChartSpec): string {
  const horizontal = c.kind === 'bar';
  const grid = '<c:majorGridlines><c:spPr><a:ln w="6350"><a:solidFill><a:srgbClr val="E2E8F0"/></a:solidFill></a:ln></c:spPr></c:majorGridlines>';
  const line = '<c:spPr><a:ln w="9525"><a:solidFill><a:srgbClr val="CBD5E1"/></a:solidFill></a:ln></c:spPr>';
  const valTitle = c.valueTitle ? `<c:title><c:tx><c:rich><a:bodyPr/><a:p><a:pPr><a:defRPr sz="900" b="0"/></a:pPr><a:r><a:rPr lang="th-TH" sz="900" b="0"/><a:t>${esc(c.valueTitle)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>` : '';
  return (
    `<c:catAx><c:axId val="50010"/><c:scaling><c:orientation val="${horizontal ? 'maxMin' : 'minMax'}"/></c:scaling><c:delete val="0"/><c:axPos val="${horizontal ? 'l' : 'b'}"/><c:numFmt formatCode="General" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>${line}${txPr(900)}<c:crossAx val="50020"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>` +
    `<c:valAx><c:axId val="50020"/><c:scaling><c:orientation val="minMax"/><c:min val="0"/></c:scaling><c:delete val="0"/><c:axPos val="${horizontal ? 'b' : 'l'}"/>${grid}${valTitle}<c:numFmt formatCode="General" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:spPr><a:ln><a:noFill/></a:ln></c:spPr>${txPr(900)}<c:crossAx val="50010"/><c:crosses val="${horizontal ? 'max' : 'autoZero'}"/><c:crossBetween val="between"/></c:valAx>`
  );
}

export function chartXml(c: ChartSpec): string {
  const sers = c.series.map((s, i) => seriesXml(c, s, i)).join('');
  let plot: string;
  if (c.kind === 'pie') plot = `<c:pieChart><c:varyColors val="1"/>${sers}<c:firstSliceAng val="0"/></c:pieChart>`;
  else if (c.kind === 'doughnut') plot = `<c:doughnutChart><c:varyColors val="1"/>${sers}<c:firstSliceAng val="0"/><c:holeSize val="55"/></c:doughnutChart>`;
  else if (c.kind === 'line') plot = `<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>${sers}<c:marker val="1"/><c:axId val="50010"/><c:axId val="50020"/></c:lineChart>${axesXml(c)}`;
  else plot = `<c:barChart><c:barDir val="${c.kind === 'bar' ? 'bar' : 'col'}"/><c:grouping val="${c.stacked ? 'stacked' : 'clustered'}"/><c:varyColors val="0"/>${sers}<c:gapWidth val="${c.stacked ? 40 : 70}"/>${c.stacked ? '<c:overlap val="100"/>' : ''}<c:axId val="50010"/><c:axId val="50020"/></c:barChart>${axesXml(c)}`;
  const legend = c.series.length > 1 || c.kind === 'pie' || c.kind === 'doughnut' ? `<c:legend><c:legendPos val="b"/><c:overlay val="0"/>${txPr(900)}</c:legend>` : '';
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<c:roundedCorners val="0"/><c:chart>` +
    `<c:title><c:tx><c:rich><a:bodyPr/><a:p><a:pPr><a:defRPr sz="1300" b="1"/></a:pPr><a:r><a:rPr lang="th-TH" sz="1300" b="1">${fill('0F172A')}<a:latin typeface="Tahoma"/><a:cs typeface="Tahoma"/></a:rPr><a:t>${esc(c.title)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>` +
    `<c:autoTitleDeleted val="0"/><c:plotArea><c:layout/>${plot}</c:plotArea>${legend}<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart>` +
    `<c:spPr>${fill('FFFFFF')}<a:ln w="9525"><a:solidFill><a:srgbClr val="CBD5E1"/></a:solidFill></a:ln></c:spPr>${txPr(1000)}</c:chartSpace>`
  );
}

function drawingXml(items: { spec: ChartSpec; rid: string }[]): string {
  const anchors = items
    .map(({ spec, rid }, i) => {
      const a = spec.anchor;
      return (
        `<xdr:twoCellAnchor editAs="oneCell"><xdr:from><xdr:col>${a.col}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${a.row}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>` +
        `<xdr:to><xdr:col>${a.col + a.cols}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${a.row + a.rows}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>` +
        `<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${i + 2}" name="Chart ${i + 1}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>` +
        `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="${rid}"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>`
      );
    })
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${anchors}</xdr:wsDr>`;
}

const attr = (tag: string, name: string) => new RegExp(`${name}="([^"]*)"`).exec(tag)?.[1];
const unesc = (s: string) => s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

/** เติมกราฟลงไฟล์ xlsx — คืน buffer ใหม่ (ไม่มีกราฟ = คืนของเดิม) */
export async function injectCharts(xlsx: Buffer, charts: ChartSpec[]): Promise<Buffer> {
  if (!charts.length) return xlsx;
  const zip = await JSZip.loadAsync(xlsx);
  const read = async (p: string) => (await zip.file(p)?.async('string')) ?? '';

  // ชื่อชีต → ไฟล์ xml ของชีต
  const wb = await read('xl/workbook.xml');
  const rels = await read('xl/_rels/workbook.xml.rels');
  const targetById = new Map<string, string>();
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) targetById.set(attr(m[0], 'Id') ?? '', attr(m[0], 'Target') ?? '');
  const sheetFile = new Map<string, string>();
  for (const m of wb.matchAll(/<sheet\b[^>]*>/g)) {
    const t = targetById.get(attr(m[0], 'r:id') ?? '');
    if (t) sheetFile.set(unesc(attr(m[0], 'name') ?? ''), t.startsWith('/') ? t.slice(1) : `xl/${t}`);
  }

  let contentTypes = await read('[Content_Types].xml');
  const overrides: string[] = [];
  let chartNo = 0;
  let drawingNo = 0;

  const bySheet = new Map<string, ChartSpec[]>();
  for (const c of charts) bySheet.set(c.sheet, [...(bySheet.get(c.sheet) ?? []), c]);

  for (const [sheet, specs] of bySheet) {
    const file = sheetFile.get(sheet);
    if (!file) throw new Error(`ไม่พบชีต "${sheet}" สำหรับใส่กราฟ`);
    drawingNo += 1;
    const items: { spec: ChartSpec; rid: string }[] = [];
    const drawingRels: string[] = [];
    specs.forEach((spec, i) => {
      chartNo += 1;
      const rid = `rId${i + 1}`;
      items.push({ spec, rid });
      zip.file(`xl/charts/chart${chartNo}.xml`, chartXml(spec));
      drawingRels.push(`<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart${chartNo}.xml"/>`);
      overrides.push(`<Override PartName="/xl/charts/chart${chartNo}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`);
    });
    zip.file(`xl/drawings/drawing${drawingNo}.xml`, drawingXml(items));
    zip.file(`xl/drawings/_rels/drawing${drawingNo}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${drawingRels.join('')}</Relationships>`);
    overrides.push(`<Override PartName="/xl/drawings/drawing${drawingNo}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`);

    // ผูก drawing เข้ากับชีต
    const relPath = file.replace('worksheets/', 'worksheets/_rels/') + '.rels';
    const drawingRel = `<Relationship Id="rIdBqDrawing" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing${drawingNo}.xml"/>`;
    const existing = await read(relPath);
    zip.file(
      relPath,
      existing ? existing.replace('</Relationships>', `${drawingRel}</Relationships>`) : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${drawingRel}</Relationships>`,
    );
    let xml = await read(file);
    if (!/xmlns:r=/.test(xml)) xml = xml.replace('<worksheet ', '<worksheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ');
    const tag = '<drawing r:id="rIdBqDrawing"/>';
    const after = /<(legacyDrawing|legacyDrawingHF|picture|oleObjects|controls|webPublishItems|tableParts|extLst)\b/.exec(xml);
    xml = after ? xml.slice(0, after.index) + tag + xml.slice(after.index) : xml.replace('</worksheet>', `${tag}</worksheet>`);
    zip.file(file, xml);
  }

  contentTypes = contentTypes.replace('</Types>', `${overrides.join('')}</Types>`);
  zip.file('[Content_Types].xml', contentTypes);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
