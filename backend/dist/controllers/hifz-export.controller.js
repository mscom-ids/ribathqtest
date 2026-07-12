"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.exportMonthlyReportPdf = exports.exportMonthlyReportExcel = void 0;
const XLSX = __importStar(require("xlsx"));
const table_pdf_1 = require("../utils/table-pdf");
function getExportPayload(req) {
    const month = String(req.body?.month || '');
    if (!/^\d{4}-\d{2}$/.test(month))
        throw new Error('A valid report month is required.');
    if (!Array.isArray(req.body?.rows) || req.body.rows.length > 5000) {
        throw new Error('Report rows must be an array containing at most 5000 students.');
    }
    const rows = req.body.rows.map((row) => ({
        adm_no: String(row?.adm_no || ''),
        name: String(row?.name || ''),
        standard: String(row?.standard || ''),
        hifz_pages: Number.isFinite(Number(row?.hifz_pages)) ? Number(row.hifz_pages) : '',
        recent_days: Number.isFinite(Number(row?.recent_days)) ? Number(row.recent_days) : '',
        juz_revision: Number.isFinite(Number(row?.juz_revision)) ? Number(row.juz_revision) : '',
        point_days: Number.isFinite(Number(row?.point_days)) ? Number(row.point_days) : '',
        grade: String(row?.grade || ''),
        attendance: String(row?.attendance || ''),
        usthad_name: String(row?.usthad_name || ''),
    }));
    const [year, monthNumber] = month.split('-').map(Number);
    const monthLabel = new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric', timeZone: 'UTC' })
        .format(new Date(Date.UTC(year, monthNumber - 1, 1)));
    const filters = [
        req.body?.filters?.standard ? `Standard: ${String(req.body.filters.standard)}` : '',
        req.body?.filters?.usthad ? `Usthad: ${String(req.body.filters.usthad)}` : '',
        req.body?.filters?.search ? `Search: ${String(req.body.filters.search)}` : '',
    ].filter(Boolean);
    return { month, monthLabel, rows, filterLabel: filters.length ? filters.join(' | ') : 'All students' };
}
const exportMonthlyReportExcel = async (req, res) => {
    try {
        const report = getExportPayload(req);
        const header = ['No.', 'Student', 'Admission No.', 'Standard', 'Hifz Pages', 'Recent Revision (Days)', 'Juz Revision (Juz)', 'Point Days', 'Grade', 'Attendance', 'Usthad'];
        const data = report.rows.map((row, index) => [
            index + 1, row.name, row.adm_no, row.standard, row.hifz_pages, row.recent_days,
            row.juz_revision, row.point_days, row.grade, row.attendance, row.usthad_name,
        ]);
        const worksheet = XLSX.utils.aoa_to_sheet([
            [`Monthly Hifz Report - ${report.monthLabel}`],
            [`Filters: ${report.filterLabel}`],
            [`Students: ${report.rows.length}`],
            [], header, ...data,
        ]);
        worksheet['!cols'] = [
            { wch: 6 }, { wch: 30 }, { wch: 15 }, { wch: 14 }, { wch: 12 },
            { wch: 23 }, { wch: 20 }, { wch: 12 }, { wch: 10 }, { wch: 30 }, { wch: 38 },
        ];
        worksheet['!autofilter'] = { ref: `A5:K${Math.max(5, data.length + 5)}` };
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Monthly Report');
        const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
        res.setHeader('Content-Disposition', `attachment; filename="hifz-monthly-report-${report.month}.xlsx"`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buffer);
    }
    catch (err) {
        console.error('Error exporting monthly report to Excel:', err);
        res.status(400).json({ success: false, error: err.message || 'Failed to export Excel report.' });
    }
};
exports.exportMonthlyReportExcel = exportMonthlyReportExcel;
const exportMonthlyReportPdf = async (req, res) => {
    try {
        const report = getExportPayload(req);
        const pdf = (0, table_pdf_1.createTablePdf)({
            title: `Monthly Hifz Report - ${report.monthLabel}`,
            subtitle: `${report.filterLabel} | ${report.rows.length} student${report.rows.length === 1 ? '' : 's'}`,
            columns: [
                { label: 'No.', width: 26, align: 'right' }, { label: 'Student', width: 125 },
                { label: 'Adm. No.', width: 52 }, { label: 'Standard', width: 50 },
                { label: 'Hifz', width: 48, align: 'right' }, { label: 'Recent', width: 48, align: 'right' },
                { label: 'Juz Rev.', width: 48, align: 'right' }, { label: 'Points', width: 48, align: 'right' },
                { label: 'Grade', width: 42 }, { label: 'Attendance', width: 115 }, { label: 'Usthad', width: 180 },
            ],
            rows: report.rows.map((row, index) => [
                String(index + 1), row.name, row.adm_no, row.standard, String(row.hifz_pages),
                String(row.recent_days), String(row.juz_revision), String(row.point_days),
                row.grade, row.attendance, row.usthad_name,
            ]),
        });
        res.setHeader('Content-Disposition', `attachment; filename="hifz-monthly-report-${report.month}.pdf"`);
        res.setHeader('Content-Type', 'application/pdf');
        res.send(pdf);
    }
    catch (err) {
        console.error('Error exporting monthly report to PDF:', err);
        res.status(400).json({ success: false, error: err.message || 'Failed to export PDF report.' });
    }
};
exports.exportMonthlyReportPdf = exportMonthlyReportPdf;
