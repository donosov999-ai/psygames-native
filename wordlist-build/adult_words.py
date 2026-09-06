# -*- coding: utf-8 -*-
"""ВЗРОСЛАЯ ЛЕКСИКА — ОДИН СПИСОК НА ВСЕ ЯЗЫКИ НАБОРА.

🔴 ЗАЧЕМ ОТДЕЛЬНЫЙ ФАЙЛ. Все наборы «Найди все слова» собраны из ОДНОГО корпуса
субтитров (OpenSubtitles через `hermitdave/FrequencyWords`), поэтому и мусор в
них один и тот же. Пока фильтр жил внутри каждого скрипта, он был у двух языков
из семи, а пять собранных 06.09.2026 приехали с `cazzo`, `puta`, `salope` в
целях и `bastardo` в БАЗАХ — то есть в заголовке уровня. Приложение помечено
«Для всех».

⚠️ ЧУЖОЙ СПИСОК ЗАМЕРЕН НА СВОИХ ДАННЫХ, А НЕ ПРИМЕНЁН ЦЕЛИКОМ. LDNOOBW
(CC BY 4.0) дал по четырём языкам 46 баз и 66 целей, и добрая половина — обычные
слова: `martillo` (молоток), `torneira` (кран), `aranha` (паук), `comer` (есть),
`regina` (королева), `cadavere` (труп), `burro` (осёл). Списки ниже — то, что
осталось после разбора КАЖДОГО слова глазами.

⚠️ ГРАНИЦА ОДНА НА ВСЕ ЯЗЫКИ, чтобы наборы не разъехались:
  режем — обсценное и телесное · оскорбление ЧЕЛОВЕКА · вражду по признаку ·
          половое · наркотики;
  оставляем — смерть, кровь, война, труп · животных (`asno`, `burro`, `porco`) ·
          прилагательные (`maldito`) · слова о явлении, а не о человеке.

⚠️ СРАВНЕНИЕ ТОЛЬКО ПОЛНЫМ СОВПАДЕНИЕМ. Отбор по началу слова уносит `assemble`,
`titanic`, `arsenal`, «простуду» и «сражение» — проверено соседней сессией.
"""

ВЗРОСЛОЕ = {
    'es': {
        'bastardo', 'esperma', 'racista', 'marica', 'pis', 'sexo', 'idiota',
        'puta', 'puto', 'coño', 'joder', 'polla', 'mierda', 'cabron', 'cabrón',
        'zorra', 'follar', 'sexual', 'pene', 'vagina', 'droga', 'cocaina', 'cocaína',
    },
    'fr': {
        'branleur', 'connard', 'connasse', 'bite', 'branler', 'caca', 'chier',
        'foutre', 'merde', 'pipi', 'pisser', 'putain', 'pute', 'salope', 'zizi',
        'trique', 'bordel', 'baiser', 'con', 'cul', 'nichon', 'bander', 'enculer',
        'sexe', 'sexuel', 'penis', 'pénis', 'vagin', 'drogue', 'cocaine', 'cocaïne',
    },
    'it': {
        'arrapato', 'bordello', 'coglione', 'cornuto', 'fottere', 'merdoso',
        'mignotta', 'pisciare', 'scopare', 'stronzo', 'sveltina', 'spagnola',
        'pisello', 'anale', 'cazzo', 'cesso', 'culo', 'figa', 'merda', 'pirla',
        'sega', 'troia', 'cacca', 'puttana', 'vaffanculo', 'sesso', 'sessuale',
        'pene', 'vagina', 'droga', 'cocaina', 'eroina',
    },
    'pt': {
        'bastardo', 'caralho', 'vibrador', 'cocaína', 'cocaina', 'bicha', 'bosta',
        'cagar', 'cona', 'corno', 'foda', 'foder', 'porra', 'puta', 'veado',
        'merda', 'buceta', 'piroca', 'punheta', 'viado', 'sexo', 'sexual',
        'pénis', 'penis', 'vagina', 'droga', 'heroína', 'heroina',
    },
    'de': {
        'bitch', 'piss', 'nazi', 'arsch', 'fotze', 'ficken', 'scheisse', 'scheiße',
        'hure', 'nutte', 'wichser', 'schwanz', 'muschi', 'sex', 'sexuell',
        'penis', 'vagina', 'droge', 'kokain', 'heroin',
    },
}


def взрослое(язык: str) -> frozenset:
    """Слова, которым не место в наборе. Сравнивать ПОЛНЫМ совпадением."""
    return frozenset(ВЗРОСЛОЕ.get(язык, ()))
