-- 046: реферальная награда только за покупку приглашённого.
-- rewarded=false — пара записана при регистрации, но кредиты ещё не начислены;
-- в момент первой успешной оплаты приглашённого флаг ставится и начисляется +2 пригласившему.
-- Существующие пары уже получали награду по старой схеме — помечаем выданными.
ALTER TABLE referral_rewards ADD COLUMN rewarded boolean NOT NULL DEFAULT false;
UPDATE referral_rewards SET rewarded = true;
