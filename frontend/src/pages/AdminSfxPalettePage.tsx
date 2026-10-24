import { useEffect, useState } from "react";

import { previewSfx, SFX_CATALOG } from "../sound";
import {
  PLAYGROUND_GROUPS,
  previewPlaygroundSfx,
  startCountdownPreview,
  stopCountdownPreview,
  stopLongPreview,
  type PlaygroundSfxName,
} from "../soundPlayground";

export function AdminSfxPalettePage() {
  const [countdown, setCountdown] = useState<number | null>(null);

  useEffect(
    () => () => {
      stopCountdownPreview();
      stopLongPreview();
    },
    [],
  );

  function onCountdown() {
    startCountdownPreview((step) => {
      setCountdown(step);
      if (step === 1) setTimeout(() => setCountdown(null), 900);
    });
  }

  return (
    <section className="panel admin-ui-palette">
      <p className="eyebrow">Nadzor</p>
      <h1>Zvok</h1>
      <p className="fine">
        Produkcijski SFX iz <code>sound.ts</code> — klik za predogled (deluje tudi, če so učinki v nastavitvah
        izklopljeni).
      </p>

      <div className="ui-palette-grid">
        <article className="ui-palette-block">
          <header className="ui-palette-head">
            <h2>SFX (v igri)</h2>
            <code className="ui-palette-source">sound.ts · SFX_CATALOG</code>
          </header>
          <div className="ui-palette-preview">
            <div className="sfx-palette" role="list">
              {SFX_CATALOG.map((item) => (
                <button
                  key={item.name}
                  type="button"
                  className="sfx-swatch"
                  role="listitem"
                  title={item.name}
                  onClick={() => previewSfx(item.name)}
                >
                  {item.label}
                  <code className="fine" style={{ display: "block", marginTop: 2 }}>
                    {item.name}
                  </code>
                </button>
              ))}
            </div>
          </div>
        </article>
      </div>

      <div className="sfx-playground">
        <header className="sfx-playground-head">
          <h2>Testni playground</h2>
          <p className="fine">
            Eksperimentalni kandidati (<code>soundPlayground.ts</code>) — še niso v igri. Poslušaj in povej, kaj
            ostane.
          </p>
        </header>

        {PLAYGROUND_GROUPS.map((group) => (
          <div key={group.id} className="sfx-playground-group">
            <h3>{group.title}</h3>
            <div className="sfx-palette" role="list">
              {group.items.map((item) => (
                <button
                  key={item.name}
                  type="button"
                  className="sfx-swatch"
                  role="listitem"
                  title={item.name}
                  onClick={() => previewPlaygroundSfx(item.name as PlaygroundSfxName)}
                >
                  {item.label}
                  <code className="fine" style={{ display: "block", marginTop: 2 }}>
                    {item.name}
                  </code>
                </button>
              ))}
            </div>
          </div>
        ))}

        <div className="sfx-playground-group">
          <h3>Countdown (naslednje vprašanje)</h3>
          <p className="fine">3 → 2 → 1</p>
          <div className="sfx-countdown-row">
            <button type="button" className="primary" onClick={onCountdown}>
              Start countdown
            </button>
            {countdown != null ? (
              <span className="sfx-countdown-n" aria-live="polite">
                {countdown}
              </span>
            ) : null}
            {countdown != null ? (
              <button type="button" onClick={() => { stopCountdownPreview(); setCountdown(null); }}>
                Stop
              </button>
            ) : null}
          </div>
        </div>

        <div className="sfx-playground-group">
          <h3>Dolgi predogledi</h3>
          <p className="fine">
            Podium ~5 s · 60 s napetost ~10 s. Nov klik ali Stop takoj utiši (tudi že načrtovane note).
          </p>
          <button
            type="button"
            className="primary"
            onClick={() => {
              stopLongPreview();
              stopCountdownPreview();
              setCountdown(null);
            }}
          >
            Stop dolgi zvok
          </button>
        </div>
      </div>
    </section>
  );
}
