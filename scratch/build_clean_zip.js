const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const workspaceRoot = path.resolve(__dirname, '..');
const tempDir = path.resolve(workspaceRoot, 'clean_project_tmp');

// Exclude list rules
const excludeDirs = new Set([
    'node_modules',
    '.git',
    '.next',
    '.next-build-check',
    'pgsql_bin',
    'clean_project_tmp',
    'backup_2026-04-30T11-25-21',
    'uploads',
    '.snapshots',
    '.codex',
    '.codex-video-frames',
    '.claude'
]);

function shouldCopyFile(filePath, fileName) {
    // Exclude .env files
    if (fileName.startsWith('.env')) return false;

    // Exclude database backups / zip archives
    if (fileName.endsWith('.zip')) return false;
    if (fileName.endsWith('.sql')) return false;

    // Exclude logs
    if (fileName.endsWith('.log')) return false;
    if (fileName.endsWith('.txt') && (fileName.includes('error') || fileName.startsWith('ts_errors') || fileName === 'errors.txt')) return false;

    // Exclude scratch scripts in root
    const relativeDir = path.relative(workspaceRoot, path.dirname(filePath));
    if (relativeDir === '') { // Root directory
        if (fileName.startsWith('scratch') && fileName.endsWith('.js')) return false;
        if (fileName.startsWith('fix_') && fileName.endsWith('.js')) return false;
        if (fileName.startsWith('check_') && fileName.endsWith('.js')) return false;
        if (fileName.startsWith('debug_') && fileName.endsWith('.json')) return false;
        
        const rootExcludeFiles = [
            'add_verses.js', 'check-r263.ts', 'fix-constraints.ts', 'migrate-hifz.ts',
            'hifz_students.json', 'temp_calendar.json', 'temp_out.json', 'temp_sessions.json',
            'students_cols.json', 'r152_logs.json', 'tsc_errors.log', 'tsc_errors.txt',
            'check_zxc.js', 'dev-combined.err.log', 'dev-combined.log'
        ];
        if (rootExcludeFiles.includes(fileName)) return false;
    }

    // Exclude nested build outputs or env files inside backend/
    if (relativeDir.startsWith('backend') && (fileName === '.env' || fileName.startsWith('.env.'))) return false;

    return true;
}

function copyRecursive(src, dest) {
    const stats = fs.statSync(src);
    
    if (stats.isDirectory()) {
        const dirName = path.basename(src);
        if (excludeDirs.has(dirName)) return;

        if (!fs.existsSync(dest)) {
            fs.mkdirSync(dest, { recursive: true });
        }

        const children = fs.readdirSync(src);
        for (const child of children) {
            copyRecursive(path.resolve(src, child), path.resolve(dest, child));
        }
    } else if (stats.isFile()) {
        const fileName = path.basename(src);
        if (shouldCopyFile(src, fileName)) {
            const destDir = path.dirname(dest);
            if (!fs.existsSync(destDir)) {
                fs.mkdirSync(destDir, { recursive: true });
            }
            fs.copyFileSync(src, dest);
        }
    }
}

async function run() {
    console.log('Cleaning existing zip and tmp folders...');
    if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
    const zipPath = path.resolve(workspaceRoot, 'clean_codebase.zip');
    if (fs.existsSync(zipPath)) {
        fs.unlinkSync(zipPath);
    }

    console.log('Copying clean codebase files...');
    copyRecursive(workspaceRoot, tempDir);

    // Create env.example templates in temp folder if they don't exist
    const backendEnvExample = path.resolve(tempDir, 'backend', '.env.example');
    if (!fs.existsSync(backendEnvExample)) {
        fs.writeFileSync(backendEnvExample, `PORT=5000\nDATABASE_URL=postgresql://username:password@localhost:5432/dbname\nJWT_SECRET=your_jwt_secret_key_here\nSUPABASE_URL=your_supabase_url_here\nSUPABASE_KEY=your_supabase_service_role_key_here\n`);
    }
    
    const rootEnvExample = path.resolve(tempDir, '.env.example');
    if (!fs.existsSync(rootEnvExample)) {
        fs.writeFileSync(rootEnvExample, `NEXT_PUBLIC_API_URL=http://localhost:5000/api\n`);
    }

    console.log('Compressing codebase into clean_codebase.zip using PowerShell...');
    // We run PowerShell Compress-Archive in the parent directory to keep zip root clean
    execSync(`powershell.exe -Command "Compress-Archive -Path '${tempDir}\\*' -DestinationPath '${zipPath}' -Force"`);

    console.log('Cleaning up temporary files...');
    fs.rmSync(tempDir, { recursive: true, force: true });

    console.log('SUCCESS: Created clean_codebase.zip in the project root directory!');
}

run().catch(console.error);
