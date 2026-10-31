-- Link an exam candidate row to its attempt once the candidate starts the exam.
ALTER TABLE exam_candidates
    ADD CONSTRAINT fk_exam_candidates_attempt
    FOREIGN KEY (attempt_id) REFERENCES attempts (id) ON DELETE SET NULL;
