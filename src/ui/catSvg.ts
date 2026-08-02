/**
 * Chewgy himself. Inline SVG so the sprite is theme-independent and needs no
 * image asset; mood/status is driven entirely by CSS attribute selectors on
 * `body[data-mood]` / `body[data-status]` in media/chewgy.css.
 */
export function catSvg(): string {
  return `<svg class="cat" viewBox="0 0 120 108" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Chewgy the mochi cat">
  <defs>
    <linearGradient id="mochi" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#FBF1E6" />
      <stop offset="100%" stop-color="#EED9C4" />
    </linearGradient>
  </defs>

  <!-- tail -->
  <path d="M104 82 C 118 80, 116 62, 106 60"
        fill="none" stroke="#E2C6AC" stroke-width="7" stroke-linecap="round" />

  <!-- ears -->
  <path d="M26 40 L 30 16 L 50 30 Z" fill="#F6E4D3" stroke="#DEC3A8" stroke-width="2" stroke-linejoin="round" />
  <path d="M94 40 L 90 16 L 70 30 Z" fill="#F6E4D3" stroke="#DEC3A8" stroke-width="2" stroke-linejoin="round" />
  <path d="M31 36 L 33 23 L 43 31 Z" fill="#F0AEBE" />
  <path d="M89 36 L 87 23 L 77 31 Z" fill="#F0AEBE" />

  <!-- body -->
  <path d="M60 24 C 24 24, 9 46, 9 66 C 9 88, 32 100, 60 100 C 88 100, 111 88, 111 66 C 111 46, 96 24, 60 24 Z"
        fill="url(#mochi)" stroke="#DEC3A8" stroke-width="2" />

  <!-- blush -->
  <ellipse cx="30" cy="74" rx="9" ry="5.5" fill="#F4B3C2" opacity="0.55" />
  <ellipse cx="90" cy="74" rx="9" ry="5.5" fill="#F4B3C2" opacity="0.55" />

  <!-- eyes: open -->
  <g class="eye-open">
    <circle class="pupil" cx="44" cy="63" r="5.8" fill="#3B3230" />
    <circle class="pupil" cx="76" cy="63" r="5.8" fill="#3B3230" />
    <circle cx="46" cy="61" r="1.8" fill="#FFFFFF" />
    <circle cx="78" cy="61" r="1.8" fill="#FFFFFF" />
  </g>

  <!-- eyes: closed / smug -->
  <g class="eye-closed" fill="none" stroke="#3B3230" stroke-width="2.6" stroke-linecap="round">
    <path d="M38 64 q6 -6 12 0" />
    <path d="M70 64 q6 -6 12 0" />
  </g>

  <!-- nose + unimpressed mouth -->
  <path d="M57 74 L 63 74 L 60 77.5 Z" fill="#D98A9E" />
  <path d="M60 78 v3" stroke="#B98C74" stroke-width="1.8" stroke-linecap="round" />
  <path d="M52 84 q8 -5 8 -3 q0 -2 8 3"
        fill="none" stroke="#B98C74" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />

  <!-- whiskers -->
  <g stroke="#D9BCA3" stroke-width="1.8" stroke-linecap="round">
    <path d="M14 66 L 34 68" />
    <path d="M14 76 L 34 74" />
    <path d="M106 66 L 86 68" />
    <path d="M106 76 L 86 74" />
  </g>

  <!-- paws -->
  <ellipse cx="42" cy="97" rx="10" ry="5" fill="#F6E4D3" stroke="#DEC3A8" stroke-width="1.6" />
  <ellipse cx="78" cy="97" rx="10" ry="5" fill="#F6E4D3" stroke="#DEC3A8" stroke-width="1.6" />

  <!-- sleep marks -->
  <g class="zzz" fill="#9DB4C7" font-family="var(--vscode-font-family)" font-weight="700">
    <text x="96" y="26" font-size="13">z</text>
    <text x="104" y="16" font-size="10">z</text>
  </g>
</svg>`;
}
