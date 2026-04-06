-- Partial index for top-level messages (where thread_id IS NULL)
CREATE INDEX idx_messages_top_level ON messages(channel_id, created_at) WHERE thread_id IS NULL;

-- Trigger: auto-increment reply_count on thread replies
CREATE OR REPLACE FUNCTION increment_reply_count()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.thread_id IS NOT NULL THEN
    UPDATE messages SET reply_count = reply_count + 1 WHERE id = NEW.thread_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_increment_reply_count
AFTER INSERT ON messages
FOR EACH ROW EXECUTE FUNCTION increment_reply_count();
