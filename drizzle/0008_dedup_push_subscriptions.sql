-- Remove duplicate (user_id, endpoint) rows, keeping the most recent by created_at.
-- Tiebreak on id (UUID) lexicographic order when created_at is identical.
DELETE FROM "push_subscriptions" t1
USING "push_subscriptions" t2
WHERE t1.user_id = t2.user_id
  AND t1.endpoint = t2.endpoint
  AND (t1.created_at < t2.created_at
       OR (t1.created_at = t2.created_at AND t1.id < t2.id));
