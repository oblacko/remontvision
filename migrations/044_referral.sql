-- 044: реферальная программа «+2 кредита обоим».
-- У каждого пользователя один реферальный код; вознаграждение однократно на приглашённого.
-- user_id/owner_id — BIGINT, как и users.id (иначе FK несовместимых типов).

CREATE TABLE IF NOT EXISTS referral_codes (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    BIGINT NOT NULL UNIQUE REFERENCES users(id),
  code       TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS referral_rewards (
  invitee_id BIGINT PRIMARY KEY REFERENCES users(id),
  owner_id   BIGINT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
