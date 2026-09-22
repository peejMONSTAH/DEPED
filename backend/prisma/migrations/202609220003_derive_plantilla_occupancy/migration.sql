-- Occupancy is the assignment, not a flag kept beside it.
--
-- plantilla_items.is_occupied duplicated what personnel.plantilla_item_id
-- already says. Keeping the two in step took roughly twenty write statements
-- across four controllers, each one a second statement that had to remember to
-- fire -- and when one did not, the registry reported a vacancy that was
-- filled, or an occupied item nobody held.
--
-- plantilla.controller.ts was already repairing the difference on every read:
--
--     const actualIsOccupied = Boolean(item.occupiedByPersonnel);
--     if (item.isOccupied !== actualIsOccupied) { ...update... }
--
-- Self-healing code is an admission that the value drifts. The API response
-- was built from the repaired value, never the stored one, so the column had
-- no reader left that trusted it.
--
-- The relation is the answer; the flag is dropped.

-- Report the drift that existed at the moment of the migration, so the size of
-- the problem is recorded rather than quietly erased.
DO $$
DECLARE
  drifted integer;
BEGIN
  SELECT count(*) INTO drifted
  FROM plantilla_items pi
  LEFT JOIN personnel p ON p.plantilla_item_id = pi.id
  WHERE pi.is_occupied <> (p.id IS NOT NULL);

  IF drifted > 0 THEN
    RAISE NOTICE
      '% plantilla item(s) had is_occupied disagreeing with their actual occupant at the time this column was dropped. The occupant relation is authoritative and is unchanged.',
      drifted;
  ELSE
    RAISE NOTICE 'is_occupied agreed with the occupant relation on every row.';
  END IF;
END $$;

ALTER TABLE "plantilla_items" DROP COLUMN "is_occupied";
