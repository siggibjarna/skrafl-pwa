# Attribution and rights status

## Skraflhjálp

This project ports the Icelandic dictionary search and rack/pattern behavior of
[Skraflhjálp / Skrafl](https://github.com/vthorsteinsson/Skrafl), by
**Vilhjálmur Þorsteinsson**. The upstream README states:
“Copyright (C) 2024 Miðeind ehf.”

The port follows upstream `languages.py`, `dawgdictionary.py`, and
`skraflpermuter.py`; dictionary production uses upstream `dawgbuilder.py` and its
resource lists. `dictionary.lock.json` records the selected upstream revision and
the resulting dictionary's SHA-256 and byte length.

**The examined upstream repository contains no explicit license file or license
grant.** Being publicly readable does not grant permission to copy, modify,
redistribute, or relicense it. Permission for this public port and its
redistribution remains unresolved. Attribution is not a substitute for that
permission, and this document does not claim to grant it. Obtain clarification
from the relevant rightsholders before public deployment or redistribution.
No broader source-code license is asserted here for upstream-derived material.

## Dictionary and Icelandic language data

The dictionary derives from **Beygingarlýsing íslensks nútímamáls (BÍN)**,
maintained by **Stofnun Árna Magnússonar í íslenskum fræðum**, together with the
upstream project's word-list additions/removals and its Icelandic word-game
conventions. Upstream credits the two-letter word list to **Skraflfélag Íslands**
and its word committee's September 2015 decision.

Consult BÍN's [data usage terms](https://bin.arnastofnun.is/gogn/skilmalar/) and
[BÍN website](https://bin.arnastofnun.is/). Data rights and conditions are separate
from source-code rights. Upstream use of BÍN does not establish that every
downstream use or redistribution is authorized. A generated DAWG is still
derived dictionary data; compression, caching, and hash-based filenames do not
remove applicable obligations.

## Trademark

**SCRABBLE is a registered trademark.** This project is not affiliated with,
sponsored by, or endorsed by the trademark owners or licensees. References to the
game describe compatibility only.

## Dependencies

Third-party npm packages retain their own licenses and copyright notices.
Consult the installed packages and `package-lock.json` for the exact versions;
the absence of an upstream Skrafl license is not resolved by a dependency's
license.
