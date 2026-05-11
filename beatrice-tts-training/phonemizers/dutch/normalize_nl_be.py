#!/usr/bin/env python3
"""
Dutch / Flemish (nl-BE) text normalizer for Beatrice TTS.

Handles:
- Numbers (cardinal, ordinal)
- Dates (Belgian format: DD/MM/YYYY)
- Currency (EUR)
- Phone numbers
- Belgian VAT numbers (BE 0123.456.789)
- Belgian company numbers (ondernemingsnummer)
- Abbreviations
- Belgian city names and business terms
"""

import re
from typing import Dict

# Number words for Dutch
UNITS = ["nul", "een", "twee", "drie", "vier", "vijf", "zes", "zeven", "acht", "negen"]
TEENS = ["tien", "elf", "twaalf", "dertien", "veertien", "vijftien", "zestien", "zeventien", "achttien", "negentien"]
TENS = ["", "", "twintig", "dertig", "veertig", "vijftig", "zestig", "zeventig", "tachtig", "negentig"]

ORDINAL_UNITS = ["nulde", "eerste", "tweede", "derde", "vierde", "vijfde", "zesde", "zevende", "achtste", "negende"]

# Belgian business terms pronunciation
PRONUNCIATION_OVERRIDES: Dict[str, str] = {
    "btw": "b\u00e9\u00e9-t\u00e9\u00e9-w\u00e9\u00e9",
    "KBO": "kaa-b\u00e9\u00e9-oo",
    "Peppol": "pep-pol",
    "bpost": "b\u00e9\u00e9-post",
    "itsme": "its-mee",
    "Bancontact": "ban-con-tact",
    "Beatrice": "bee-ah-tris",
}

# Belgian city names (ensure consistent pronunciation)
BELGIAN_CITIES = [
    "Brussel", "Bruxelles", "Antwerpen", "Gent", "Leuven", "Mechelen",
    "Brugge", "Luik", "Li\u00e8ge", "Namur", "Namen", "Hasselt",
    "Kortrijk", "Oostende", "Sint-Niklaas", "Roeselare", "Turnhout",
]


def cardinal_to_words(n: int) -> str:
    """Convert cardinal number to Dutch words."""
    if n < 0:
        return "min " + cardinal_to_words(-n)
    if n < 10:
        return UNITS[n]
    if n < 20:
        return TEENS[n - 10]
    if n < 100:
        unit = n % 10
        ten = n // 10
        if unit == 0:
            return TENS[ten]
        return UNITS[unit] + "en" + TENS[ten]
    if n < 1000:
        hundred = n // 100
        rest = n % 100
        if rest == 0:
            return UNITS[hundred] + "honderd" if hundred > 1 else "honderd"
        return (UNITS[hundred] + "honderd" if hundred > 1 else "honderd") + cardinal_to_words(rest)
    if n < 1_000_000:
        thousand = n // 1000
        rest = n % 1000
        if rest == 0:
            return cardinal_to_words(thousand) + "duizend"
        return cardinal_to_words(thousand) + "duizend" + cardinal_to_words(rest)
    if n < 1_000_000_000:
        million = n // 1_000_000
        rest = n % 1_000_000
        if rest == 0:
            return cardinal_to_words(million) + " miljoen"
        return cardinal_to_words(million) + " miljoen " + cardinal_to_words(rest)
    
    return str(n)


def ordinal_to_words(n: int) -> str:
    """Convert ordinal number to Dutch words."""
    if n < 10:
        return ORDINAL_UNITS[n]
    # For larger ordinals, add "de" to cardinal
    return cardinal_to_words(n) + "de"


def normalize_numbers(text: str) -> str:
    """Replace digits with spoken Dutch words."""
    
    def replace_ordinal(match):
        num = int(match.group(1))
        return ordinal_to_words(num)
    
    def replace_cardinal(match):
        num_str = match.group(0)
        # Handle decimal numbers
        if "." in num_str or "," in num_str:
            parts = re.split(r"[.,]", num_str)
            integer_part = int(parts[0]) if parts[0] else 0
            decimal_part = parts[1] if len(parts) > 1 else ""
            result = cardinal_to_words(integer_part) + " komma " + " ".join(UNITS[int(d)] for d in decimal_part if d.isdigit())
            return result
        return cardinal_to_words(int(num_str))
    
    # Ordinals (1ste, 2de, 3de, etc.)
    text = re.sub(r"(\d+)(?:ste|de|me)", replace_ordinal, text)
    
    # Regular numbers
    text = re.sub(r"\b\d+(?:[.,]\d+)?\b", replace_cardinal, text)
    
    return text


def normalize_dates(text: str) -> str:
    """Convert Belgian date formats to spoken form."""
    
    def replace_date(match):
        day = int(match.group(1))
        month = int(match.group(2))
        year_str = match.group(3)
        
        MONTHS = [
            "januari", "februari", "maart", "april", "mei", "juni",
            "juli", "augustus", "september", "oktober", "november", "december"
        ]
        
        month_name = MONTHS[month - 1] if 1 <= month <= 12 else str(month)
        
        if year_str:
            year = int(year_str)
            return f"{cardinal_to_words(day)} {month_name} {cardinal_to_words(year)}"
        return f"{cardinal_to_words(day)} {month_name}"
    
    # DD/MM/YYYY or DD-MM-YYYY
    text = re.sub(r"\b(\d{1,2})[/\-](\d{1,2})(?:[/\-](\d{2,4}))?\b", replace_date, text)
    
    return text


def normalize_currency(text: str) -> str:
    """Convert currency to spoken Dutch."""
    
    def replace_euro(match):
        amount_str = match.group(1).replace(".", "").replace(",", ".")
        if "." in amount_str:
            parts = amount_str.split(".")
            euros = int(parts[0])
            cents = int(parts[1].ljust(2, "0")[:2])
            if cents > 0:
                return f"{cardinal_to_words(euros)} euro en {cardinal_to_words(cents)} cent"
            return f"{cardinal_to_words(euros)} euro"
        return f"{cardinal_to_words(int(amount_str))} euro"
    
    # \u20ac or EUR followed by amount
    text = re.sub(r"(?:\u20ac|EUR)\s*([\d.,]+)", replace_euro, text)
    text = re.sub(r"([\d.,]+)\s*(?:\u20ac|EUR)", replace_euro, text)
    
    return text


def normalize_vat_numbers(text: str) -> str:
    """Normalize Belgian VAT numbers (BE 0123.456.789)."""
    
    def replace_vat(match):
        digits = re.sub(r"[^\d]", "", match.group(0))
        # Read as individual digits with pauses
        digit_words = " ".join(UNITS[int(d)] for d in digits)
        return f"BTW-nummer {digit_words}"
    
    text = re.sub(r"BE\s*\d{4}[.\s]\d{3}[.\s]\d{3}", replace_vat, text, flags=re.IGNORECASE)
    text = re.sub(r"BE\s*\d{10}", replace_vat, text, flags=re.IGNORECASE)
    
    return text


def normalize_company_numbers(text: str) -> str:
    """Normalize Belgian company numbers (ondernemingsnummers)."""
    
    def replace_company(match):
        digits = re.sub(r"[^\d]", "", match.group(0))
        digit_words = " ".join(UNITS[int(d)] for d in digits)
        return f"ondernemingsnummer {digit_words}"
    
    text = re.sub(r"\b\d{4}[.\s]\d{3}[.\s]\d{3}\b", replace_company, text)
    
    return text


def normalize_phone_numbers(text: str) -> str:
    """Normalize phone numbers to spoken digits."""
    
    def replace_phone(match):
        digits = re.sub(r"[^\d]", "", match.group(0))
        if len(digits) < 7:
            return match.group(0)  # Probably not a phone number
        digit_words = " ".join(UNITS[int(d)] for d in digits)
        return f"telefoonnummer {digit_words}"
    
    text = re.sub(r"\b0\d[\d\s./-]{6,}\b", replace_phone, text)
    
    return text


def normalize_abbreviations(text: str) -> str:
    """Expand common Dutch/Flemish abbreviations."""
    abbreviations = {
        r"\bbtw\b": "belasting op de toegevoegde waarde",
        r"\bKBO\b": "Kruispuntbank van Ondernemingen",
        r"\bBV\b": "Besloten Vennootschap",
        r"\bNV\b": "Naamloze Vennootschap",
        r"\bVZW\b": "Vereniging Zonder Winstoogmerk",
        r"\bEUR\b": "euro",
        r"\bca\.?\b": "circa",
        r"\bz\.b\.\b": "zoals bijvoorbeeld",
        r"\bngl\.?\b": "naar gelang",
        r"\bi\.v\.m\.?\b": "in verband met",
        r"\bm\.a\.w\.?\b": "met andere woorden",
    }
    
    for pattern, expansion in abbreviations.items():
        text = re.sub(pattern, expansion, text, flags=re.IGNORECASE)
    
    return text


def apply_pronunciation_dict(text: str) -> str:
    """Apply custom pronunciation overrides."""
    for word, pronunciation in PRONUNCIATION_OVERRIDES.items():
        text = re.sub(rf"\b{re.escape(word)}\b", pronunciation, text, flags=re.IGNORECASE)
    return text


def normalize(text: str) -> str:
    """Full normalization pipeline for nl-BE text."""
    text = text.strip()
    
    # Apply in order
    text = normalize_abbreviations(text)
    text = normalize_currency(text)
    text = normalize_dates(text)
    text = normalize_vat_numbers(text)
    text = normalize_company_numbers(text)
    text = normalize_phone_numbers(text)
    text = normalize_numbers(text)
    text = apply_pronunciation_dict(text)
    
    # Clean up whitespace
    text = re.sub(r"\s+", " ", text).strip()
    
    return text


if __name__ == "__main__":
    # Quick test
    test_sentences = [
        "De prijs is \u20ac120,50 voor het product.",
        "Het ondernemingsnummer is 0123.456.789.",
        "De BTW-nummer BE 0123.456.789 is geldig.",
        "Bel ons op 03 123 45 67.",
        "De factuur is voorbereid op 15/03/2026.",
        "Het is de 1ste keer dat we met Peppol werken.",
        "Ik heb \u20ac1.234,56 betaald via Bancontact.",
        "Beatrice helpt met de btw-aangifte.",
    ]
    
    for sentence in test_sentences:
        print(f"IN:  {sentence}")
        print(f"OUT: {normalize(sentence)}")
        print()
