-- Пользователю показываем уровень, а не название модели.
-- Владелец задаёт три строки в админке (модель, кредиты, доплаты за 2K/4K);
-- label в render_models — это и есть подпись уровня в генераторе.
UPDATE render_models SET label = 'Старт' WHERE label IN ('FLUX 3 Image', 'FLUX 3', 'Flux 3 Image');
