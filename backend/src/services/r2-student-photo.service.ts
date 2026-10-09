import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

const required = (key: string) => {
    const value = String(process.env[key] || '').trim();
    if (!value) throw new Error(`R2 student photo storage is not configured: ${key} is required`);
    return value;
};

const slug = (value: string) => value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'student';

function client() {
    const accountId = required('R2_ACCOUNT_ID');
    return new S3Client({
        region: 'auto',
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: {
            accessKeyId: required('R2_ACCESS_KEY_ID'),
            secretAccessKey: required('R2_SECRET_ACCESS_KEY'),
        },
    });
}

export async function uploadStudentPhoto(input: {
    admissionNumber: string;
    studentName: string;
    body: Buffer;
    contentType: string;
    extension: string;
}) {
    const admissionNumber = input.admissionNumber.trim().toUpperCase();
    if (!/^R\d{3}$/.test(admissionNumber)) {
        throw new Error('Student admission number must use the format R followed by three digits, for example R123');
    }
    const bucket = required('R2_STUDENT_PHOTOS_BUCKET');
    const publicBaseUrl = required('R2_STUDENT_PHOTOS_PUBLIC_URL').replace(/\/+$/, '');
    const safeExtension = input.extension.replace(/[^a-z0-9]/gi, '').toLowerCase();
    const key = `students/${admissionNumber}/${slug(input.studentName)}-${admissionNumber.toLowerCase()}.${safeExtension}`;

    await client().send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: input.body,
        ContentType: input.contentType,
        CacheControl: 'public, max-age=31536000, immutable',
    }));

    return { key, publicUrl: `${publicBaseUrl}/${key}` };
}
