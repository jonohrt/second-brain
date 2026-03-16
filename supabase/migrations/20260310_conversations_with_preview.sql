-- Single-query conversation list with message count and last message preview
CREATE OR REPLACE FUNCTION conversations_with_preview(row_limit int DEFAULT 50)
RETURNS TABLE (
  id uuid,
  title text,
  created_at timestamptz,
  updated_at timestamptz,
  message_count bigint,
  last_message_preview text
) AS $$
  SELECT
    c.id,
    c.title,
    c.created_at,
    c.updated_at,
    COALESCE(m.cnt, 0) AS message_count,
    LEFT(m.last_content, 100) AS last_message_preview
  FROM conversations c
  LEFT JOIN LATERAL (
    SELECT
      count(*) AS cnt,
      (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_content
    FROM messages
    WHERE conversation_id = c.id
  ) m ON true
  ORDER BY c.updated_at DESC
  LIMIT row_limit;
$$ LANGUAGE sql STABLE;
