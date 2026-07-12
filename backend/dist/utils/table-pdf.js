"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTablePdf = createTablePdf;
const PAGE_WIDTH = 842;
const PAGE_HEIGHT = 595;
const MARGIN = 30;
const HEADER_HEIGHT = 22;
const ROW_HEIGHT = 20;
const pdfText = (value) => value
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]/g, '-')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
const maxCharacters = (width, fontSize) => Math.max(1, Math.floor((width - 8) / (fontSize * 0.52)));
const fitText = (value, width, fontSize) => {
    const clean = pdfText(String(value ?? ''));
    const max = maxCharacters(width, fontSize);
    return clean.length <= max ? clean : `${clean.slice(0, Math.max(1, max - 3))}...`;
};
const textCommand = (text, x, y, size, bold = false) => `BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td (${text}) Tj ET`;
function buildPageContent(options, pageRows, pageNumber, totalPages) {
    const commands = [];
    const tableWidth = options.columns.reduce((sum, column) => sum + column.width, 0);
    commands.push('0.12 0.18 0.27 rg');
    commands.push(textCommand(pdfText(options.title), MARGIN, PAGE_HEIGHT - 34, 15, true));
    if (options.subtitle) {
        commands.push('0.35 0.40 0.48 rg');
        commands.push(textCommand(pdfText(options.subtitle), MARGIN, PAGE_HEIGHT - 49, 8));
    }
    commands.push(textCommand(`Page ${pageNumber} of ${totalPages}`, PAGE_WIDTH - 88, PAGE_HEIGHT - 34, 8));
    const tableTop = PAGE_HEIGHT - 70;
    commands.push('0.94 0.96 0.98 rg');
    commands.push(`${MARGIN} ${tableTop - HEADER_HEIGHT} ${tableWidth} ${HEADER_HEIGHT} re f`);
    commands.push('0.80 0.84 0.89 RG 0.5 w');
    commands.push(`${MARGIN} ${tableTop - HEADER_HEIGHT} ${tableWidth} ${HEADER_HEIGHT} re S`);
    let x = MARGIN;
    for (const column of options.columns) {
        commands.push('0.12 0.18 0.27 rg');
        commands.push(textCommand(fitText(column.label, column.width, 7), x + 4, tableTop - 14, 7, true));
        x += column.width;
        commands.push(`${x} ${tableTop - HEADER_HEIGHT} m ${x} ${tableTop} l S`);
    }
    pageRows.forEach((row, rowIndex) => {
        const rowTop = tableTop - HEADER_HEIGHT - (rowIndex * ROW_HEIGHT);
        const rowBottom = rowTop - ROW_HEIGHT;
        if (rowIndex % 2 === 1) {
            commands.push('0.98 0.99 1 rg');
            commands.push(`${MARGIN} ${rowBottom} ${tableWidth} ${ROW_HEIGHT} re f`);
        }
        commands.push('0.86 0.88 0.91 RG');
        commands.push(`${MARGIN} ${rowBottom} ${tableWidth} ${ROW_HEIGHT} re S`);
        let cellX = MARGIN;
        options.columns.forEach((column, columnIndex) => {
            const text = fitText(row[columnIndex] || '', column.width, 7);
            const estimatedWidth = text.length * 7 * 0.52;
            const textX = column.align === 'right'
                ? cellX + column.width - estimatedWidth - 4
                : cellX + 4;
            commands.push('0.12 0.18 0.27 rg');
            commands.push(textCommand(text, Math.max(cellX + 4, textX), rowBottom + 7, 7));
            cellX += column.width;
            commands.push(`${cellX} ${rowBottom} m ${cellX} ${rowTop} l S`);
        });
    });
    commands.push('0.35 0.40 0.48 rg');
    commands.push(textCommand(`Generated ${new Date().toISOString().slice(0, 10)}`, MARGIN, 18, 7));
    return commands.join('\n');
}
function createTablePdf(options) {
    const rowsPerPage = Math.floor((PAGE_HEIGHT - 110) / ROW_HEIGHT);
    const pages = Math.max(1, Math.ceil(options.rows.length / rowsPerPage));
    const objects = [];
    const addObject = (content) => {
        objects.push(content);
        return objects.length;
    };
    const catalogId = addObject('');
    const pagesId = addObject('');
    const fontRegularId = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
    const fontBoldId = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
    const pageIds = [];
    for (let pageIndex = 0; pageIndex < pages; pageIndex += 1) {
        const pageRows = options.rows.slice(pageIndex * rowsPerPage, (pageIndex + 1) * rowsPerPage);
        const stream = buildPageContent(options, pageRows, pageIndex + 1, pages);
        const streamLength = Buffer.byteLength(stream, 'latin1');
        const contentId = addObject(`<< /Length ${streamLength} >>\nstream\n${stream}\nendstream`);
        const pageId = addObject(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
            `/Resources << /Font << /F1 ${fontRegularId} 0 R /F2 ${fontBoldId} 0 R >> >> ` +
            `/Contents ${contentId} 0 R >>`);
        pageIds.push(pageId);
    }
    objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
    objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
    let pdf = '%PDF-1.4\n%PDFGEN\n';
    const offsets = [0];
    objects.forEach((object, index) => {
        offsets.push(Buffer.byteLength(pdf, 'latin1'));
        pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    });
    const xrefOffset = Buffer.byteLength(pdf, 'latin1');
    pdf += `xref\n0 ${objects.length + 1}\n`;
    pdf += '0000000000 65535 f \n';
    for (let index = 1; index <= objects.length; index += 1) {
        pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
    }
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
    return Buffer.from(pdf, 'latin1');
}
