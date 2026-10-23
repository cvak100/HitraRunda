import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { AiOpponentsField } from "../components/AiOpponentsField";
import { Avatar } from "../components/Avatar";
import { CategoryPicker } from "../components/CategoryPicker";
import { ChoiceGroup } from "../components/ChoiceGroup";
import { FinishActions } from "../components/game/FinishActions";
import { NicknameField } from "../components/NicknameField";
import { NumberStepper } from "../components/NumberStepper";
import { SearchField } from "../components/SearchField";
import { VisibilityField, type RoomVisibility } from "../components/VisibilityField";
import {
  BackNav,
  BoardLink,
  GAME_MODES,
  ModePageNav,
  PlayLink,
  boardPath,
  playPath,
} from "../gameModes";
import { PALETTE_ICONS } from "../icons";

const DEMO_CATEGORIES = [
  { slug: "zgodovina", name: "Zgodovina", question_count: 42, classic_question_count: 12 },
  { slug: "sport", name: "Šport", question_count: 28, classic_question_count: 8 },
  { slug: "film", name: "Film", question_count: 19, classic_question_count: 6 },
];

function PaletteBlock({
  name,
  source,
  children,
}: {
  name: string;
  source: string;
  children: ReactNode;
}) {
  return (
    <article className="ui-palette-block">
      <header className="ui-palette-head">
        <h2>{name}</h2>
        <code className="ui-palette-source">{source}</code>
      </header>
      <div className="ui-palette-preview">{children}</div>
    </article>
  );
}

export function AdminUiPalettePage() {
  const [cats, setCats] = useState(["zgodovina", "sport"]);
  const [catsPlain, setCatsPlain] = useState(["film"]);
  const [choice, setChoice] = useState(30);
  const [stepper, setStepper] = useState(10);
  const [bots, setBots] = useState(1);
  const [visibility, setVisibility] = useState<RoomVisibility>("public");
  const [password, setPassword] = useState("");
  const [nick, setNick] = useState("Demo igralec");
  const [search, setSearch] = useState("");

  return (
    <section className="panel admin-ui-palette">
      <p className="eyebrow">Nadzor</p>
      <h1>UI paleta</h1>
      <p className="fine">
        Skupni objekti za igro — uporabljaj te, ne kopiraj markup. Poti:{" "}
        <code>boardPath(mode)</code> / <code>playPath(mode)</code> iz <code>gameModes.tsx</code>.
      </p>

      <div className="ui-palette-grid">
        <PaletteBlock name="Ikone (vse)" source="icons.tsx · PALETTE_ICONS">
          <div className="ui-palette-icons">
            {PALETTE_ICONS.map(({ name, Component }) => (
              <div key={name} className="ui-palette-icon-cell">
                <span className="ui-palette-icon">
                  <Component />
                </span>
                <code>{name}</code>
              </div>
            ))}
          </div>
        </PaletteBlock>

        <PaletteBlock name="BoardLink · icon" source='BoardLink variant="icon"'>
          <BoardLink to="/lestvica/hitrarunda" variant="icon" />
        </PaletteBlock>

        <PaletteBlock name="BoardLink · nav" source='BoardLink variant="nav"'>
          <BoardLink mode="dirka" variant="nav" />
        </PaletteBlock>

        <PaletteBlock name="BoardLink · labeled" source='BoardLink variant="labeled"'>
          <BoardLink mode="multiplayer" variant="labeled" />
        </PaletteBlock>

        <PaletteBlock name="PlayLink" source="PlayLink / playPath()">
          <PlayLink mode="hitrarunda" />
        </PaletteBlock>

        <PaletteBlock name="ModePageNav" source="ModePageNav">
          <ModePageNav mode="ala_milijonar" />
        </PaletteBlock>

        <PaletteBlock name="BackNav" source="BackNav">
          <BackNav to="/igra" label="Nazaj na igre" />
        </PaletteBlock>

        <PaletteBlock name="FinishActions" source="components/game/FinishActions">
          <FinishActions replayTo={playPath("hitrarunda")} boardPath={boardPath("hitrarunda")} />
          <p className="fine" style={{ marginTop: 8 }}>
            Z rematch gumbom:
          </p>
          <FinishActions
            replayTo={playPath("multiplayer")}
            boardPath={boardPath("multiplayer")}
            onRematch={() => undefined}
          />
        </PaletteBlock>

        <PaletteBlock name="CategoryPicker · brez count" source="showCounts={false}">
          <CategoryPicker categories={DEMO_CATEGORIES} value={catsPlain} onChange={setCatsPlain} />
        </PaletteBlock>

        <PaletteBlock name="CategoryPicker · z count" source='showCounts="all" · Ime (42)'>
          <CategoryPicker categories={DEMO_CATEGORIES} value={cats} onChange={setCats} showCounts="all" showSelectAll />
        </PaletteBlock>

        <PaletteBlock name="AiOpponentsField" source='label "AI bots" · mode=dirka|multiplayer'>
          <AiOpponentsField mode="multiplayer" value={bots} onChange={setBots} max={5} />
        </PaletteBlock>

        <PaletteBlock name="ChoiceGroup" source="components/ChoiceGroup">
          <ChoiceGroup
            label="Čas na vprašanje"
            options={[10, 15, 20, 30, 60]}
            value={choice}
            onChange={setChoice}
            format={(v) => `${v} s`}
          />
        </PaletteBlock>

        <PaletteBlock name="VisibilityField" source="components/VisibilityField">
          <VisibilityField
            value={visibility}
            onChange={setVisibility}
            password={password}
            onPasswordChange={setPassword}
          />
        </PaletteBlock>

        <PaletteBlock name="NumberStepper" source="components/NumberStepper">
          <NumberStepper label="Število vprašanj" value={stepper} options={[5, 10, 15, 20]} onChange={setStepper} />
        </PaletteBlock>

        <PaletteBlock name="NicknameField" source="components/NicknameField">
          <NicknameField value={nick} onChange={setNick} label="Vzdevek" />
        </PaletteBlock>

        <PaletteBlock name="SearchField" source="components/SearchField">
          <SearchField value={search} onChange={setSearch} onSubmit={() => undefined} />
        </PaletteBlock>

        <PaletteBlock name="Avatar" source="components/Avatar">
          <div className="actions" style={{ alignItems: "center", gap: 12 }}>
            <Avatar avatar="ris" color="#7dcea0" size={36} title="Ris" />
            <Avatar avatar="volk" color="#e8a87c" size={48} title="Volk" />
            <Avatar avatar="lisica" color="#85c1e9" size={28} title="Lisica" />
          </div>
        </PaletteBlock>

        <PaletteBlock name="GAME_MODES / poti" source="gameModes.tsx">
          <ul className="ui-palette-paths">
            {GAME_MODES.map((mode) => (
              <li key={mode.id}>
                <strong>{mode.title}</strong>
                <span className="fine">
                  {" "}
                  · <Link to={mode.playTo}>{mode.playTo}</Link> ·{" "}
                  <Link to={mode.boardTo}>{mode.boardTo}</Link>
                </span>
              </li>
            ))}
          </ul>
        </PaletteBlock>
      </div>
    </section>
  );
}
