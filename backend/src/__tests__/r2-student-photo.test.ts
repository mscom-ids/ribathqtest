import assert from 'node:assert/strict';
import { S3Client, PutObjectCommandInput } from '@aws-sdk/client-s3';
import { uploadStudentPhoto } from '../services/r2-student-photo.service';

async function main() {
    const environment = {
        R2_ACCOUNT_ID: 'photo-test-account',
        R2_ACCESS_KEY_ID: 'photo-test-key',
        R2_SECRET_ACCESS_KEY: 'photo-test-secret',
        R2_STUDENT_PHOTOS_BUCKET: 'photo-test-bucket',
        R2_STUDENT_PHOTOS_PUBLIC_URL: 'https://student-photos.example.invalid/',
    };
    const previous = new Map(Object.keys(environment).map(key => [key, process.env[key]]));
    const send = S3Client.prototype.send;
    const uploads: PutObjectCommandInput[] = [];
    S3Client.prototype.send = (async (command: { input: PutObjectCommandInput }) => {
        uploads.push(command.input);
        return {};
    }) as typeof send;
    Object.assign(process.env, environment);
    try {
        const photo = { admissionNumber: 'R292', studentName: 'Sample Student', contentType: 'image/png', extension: '.png' };
        const oldBytes = Buffer.from('first photo');
        const newBytes = Buffer.from('selected replacement photo');
        const first = await uploadStudentPhoto({ ...photo, body: oldBytes });
        const replacement = await uploadStudentPhoto({ ...photo, body: newBytes });
        const repeat = await uploadStudentPhoto({ ...photo, body: newBytes });
        assert.notEqual(first.publicUrl, replacement.publicUrl, 'replacement bytes must bypass the old immutable URL');
        assert.notEqual(first.key, replacement.key, 'uploading a draft must not overwrite the saved photo');
        assert.equal(replacement.publicUrl, repeat.publicUrl, 'identical bytes have a stable URL');
        assert.match(replacement.key, /^students\/R292\/sample-student-r292-[a-f0-9]{16}\.png$/);
        assert.equal(uploads[0].Body, oldBytes);
        assert.equal(uploads[1].Body, newBytes);
        assert.equal(uploads[1].ContentType, 'image/png');
        assert.equal(uploads[1].CacheControl, 'public, max-age=31536000, immutable');
        await assert.rejects(uploadStudentPhoto({ ...photo, admissionNumber: '../invalid', body: newBytes }));
        assert.equal(uploads.length, 3, 'invalid IDs never reach storage');
        console.log('Student photos: replacement URLs change, saved images remain intact, and identical content is stable. No storage requests were sent.');
    } finally {
        S3Client.prototype.send = send;
        for (const [key, value] of previous) {
            if (value === undefined) delete process.env[key]; else process.env[key] = value;
        }
    }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
