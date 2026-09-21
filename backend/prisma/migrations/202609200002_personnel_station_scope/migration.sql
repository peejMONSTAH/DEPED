-- Station assignment becomes an explicit attribute of a personnel record.
-- Until now AO II authorization scope was guessed per request by substring-matching
-- a hardcoded school list against address/designation/last_name. This migration
-- runs that heuristic exactly once, here, where its result is reviewable data.

ALTER TABLE "personnel" ADD COLUMN "school" TEXT;
ALTER TABLE "personnel" ADD COLUMN "district" TEXT;

-- account_creation_requests already carried "school"; it was dropped on approval.
ALTER TABLE "account_creation_requests" ADD COLUMN "district" TEXT;

CREATE TEMP TABLE _station_catalog (ord INTEGER, school TEXT, district TEXT);
INSERT INTO _station_catalog (ord, school, district) VALUES
  (1,  'Matulas Elementary School',                     'District 1'),
  (2,  'Morales Elementary School',                     'District 1'),
  (3,  'Salkan Elementary School',                      'District 1'),
  (4,  'Koronadal Central Elementary School 1',         'District 1'),
  (5,  'Koronadal Central Elementary School I',         'District 1'),
  (6,  'Mariano Villegas Elementary School',            'District 6'),
  (7,  'Carpenter Hill Elementary School',              'District 6'),
  (8,  'Mama Mapambucol Elementary School',             'District 6'),
  (9,  'Barrio 8 Elementary School',                    'District 6'),
  (10, 'Mangga Elementary School',                      'District 6'),
  (11, 'El Gawel Elementary School',                    'District 6'),
  (12, 'Takilay Elementary School',                     'District 6'),
  (13, 'Koronadal National Comprehensive High School',  NULL);

-- 1. Plantilla department is the authoritative station: account creation already
--    copies it verbatim into the school field of an account request.
UPDATE "personnel" p
SET "school" = pi."department"
FROM "plantilla_items" pi
WHERE p."plantilla_item_id" = pi."id"
  AND p."school" IS NULL
  AND NULLIF(TRIM(pi."department"), '') IS NOT NULL;

-- 2. Otherwise recover the station from the text it was smeared across. last_name is
--    included because AO II accounts store their school assignment in that column.
WITH matched AS (
  SELECT DISTINCT ON (p."id") p."id" AS personnel_id, c.school, c.district
  FROM "personnel" p
  JOIN _station_catalog c
    ON COALESCE(p."address", '')     ILIKE '%' || c.school || '%'
    OR COALESCE(p."designation", '') ILIKE '%' || c.school || '%'
    OR COALESCE(p."last_name", '')   ILIKE '%' || c.school || '%'
  WHERE p."school" IS NULL
  ORDER BY p."id", c.ord
)
UPDATE "personnel" p
SET "school" = m.school, "district" = m.district
FROM matched m
WHERE p."id" = m.personnel_id;

-- 3. Surviving AO II accounts whose school never matched the catalog: the assignment
--    is whatever was put in last_name ('Staff' was the placeholder for none).
UPDATE "personnel" p
SET "school" = TRIM(p."last_name")
FROM "users" u
JOIN "roles" r ON u."role_id" = r."id"
WHERE u."personnel_id" = p."id"
  AND r."name" = 'AO_II'
  AND p."school" IS NULL
  AND NULLIF(TRIM(p."last_name"), '') IS NOT NULL
  AND TRIM(p."last_name") <> 'Staff';

-- 4. District from the catalog for every record whose school is a known station.
UPDATE "personnel" p
SET "district" = c.district
FROM _station_catalog c
WHERE p."district" IS NULL
  AND c.district IS NOT NULL
  AND LOWER(TRIM(p."school")) = LOWER(TRIM(c.school));

-- 5. District from the free-text markers the resolver used to scan for.
UPDATE "personnel" p
SET "district" = CASE
  WHEN CONCAT_WS(' ', p."address", p."designation", p."last_name", u."email") ~* '(district ?1|dist ?1|ao_?1)' THEN 'District 1'
  WHEN CONCAT_WS(' ', p."address", p."designation", p."last_name", u."email") ~* '(district ?6|dist ?6|ao_?6)' THEN 'District 6'
END
FROM "users" u
WHERE u."personnel_id" = p."id"
  AND p."district" IS NULL
  AND CONCAT_WS(' ', p."address", p."designation", p."last_name", u."email") ~* '(district ?[16]|dist ?[16]|ao_?[16])';

DROP TABLE _station_catalog;

CREATE INDEX "personnel_school_idx"   ON "personnel"("school");
CREATE INDEX "personnel_district_idx" ON "personnel"("district");
