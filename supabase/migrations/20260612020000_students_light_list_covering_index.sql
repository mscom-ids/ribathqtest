-- Hot-path optimization for /api/students?light=true&status=active&limit=...
-- Safe additive index only; no data is modified.

CREATE INDEX IF NOT EXISTS idx_students_status_name_adm_light
    ON public.students (status, name, adm_no)
    INCLUDE (
        dob,
        standard,
        batch_year,
        phone,
        email,
        father_name,
        photo_url,
        gender,
        admission_date,
        place,
        hifz_mentor_id,
        school_mentor_id,
        madrasa_mentor_id,
        phone_number
    );

ANALYZE public.students;
