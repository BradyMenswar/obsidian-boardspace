import {
	TldrawUiMenuCheckboxItem,
	TldrawUiMenuGroup as TldrawUiMenuGroupPrimitive,
	TldrawUiMenuSubmenu as TldrawUiMenuSubmenuPrimitive,
} from "tldraw";
import {
	createContext,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";

const STORAGE_KEY = "boardspace.canvas-tones";

const LIGHT_TONES = [
	{ id: "paper", label: "Paper" },
	{ id: "linen", label: "Linen" },
	{ id: "chalk", label: "Chalk" },
] as const;

const DARK_TONES = [
	{ id: "graphite", label: "Graphite" },
	{ id: "slate", label: "Slate" },
	{ id: "ink", label: "Ink" },
] as const;

type LightCanvasTone = (typeof LIGHT_TONES)[number]["id"];
type DarkCanvasTone = (typeof DARK_TONES)[number]["id"];

interface BoardspaceCanvasTonePreferences {
	light: LightCanvasTone;
	dark: DarkCanvasTone;
}

interface BoardspaceCanvasToneContextValue {
	currentTone: LightCanvasTone | DarkCanvasTone;
	isDarkMode: boolean;
	setCurrentTone: (tone: LightCanvasTone | DarkCanvasTone) => void;
}

const DEFAULT_PREFERENCES: BoardspaceCanvasTonePreferences = {
	light: "paper",
	dark: "graphite",
};

const BoardspaceCanvasToneContext =
	createContext<BoardspaceCanvasToneContextValue | null>(null);

const TldrawUiMenuSubmenu = TldrawUiMenuSubmenuPrimitive as unknown as ({
	id,
	label,
	children,
}: {
	id: string;
	label?: string;
	children: React.ReactNode;
}) => JSX.Element;

const TldrawUiMenuGroup = TldrawUiMenuGroupPrimitive as unknown as ({
	id,
	children,
}: {
	id: string;
	children: React.ReactNode;
}) => JSX.Element;

export function BoardspaceCanvasToneProvider({
	children,
}: {
	children: React.ReactNode;
}) {
	const [preferences, setPreferences] = useState<BoardspaceCanvasTonePreferences>(
		readStoredCanvasTonePreferences,
	);
	const [isDarkMode, setIsDarkMode] = useState(() =>
		document.body.classList.contains("theme-dark"),
	);

	useEffect(() => {
		const observer = new MutationObserver(() => {
			setIsDarkMode(document.body.classList.contains("theme-dark"));
		});

		observer.observe(document.body, {
			attributes: true,
			attributeFilter: ["class"],
		});

		return () => observer.disconnect();
	}, []);

	const value = useMemo<BoardspaceCanvasToneContextValue>(() => {
		const currentTone = isDarkMode ? preferences.dark : preferences.light;

		return {
			currentTone,
			isDarkMode,
			setCurrentTone: (tone) => {
				setPreferences((current) => {
					const next = isDarkMode
						? { ...current, dark: tone as DarkCanvasTone }
						: { ...current, light: tone as LightCanvasTone };

					writeStoredCanvasTonePreferences(next);
					return next;
				});
			},
		};
	}, [isDarkMode, preferences]);

	return (
		<BoardspaceCanvasToneContext.Provider value={value}>
			{children}
		</BoardspaceCanvasToneContext.Provider>
	);
}

export function useBoardspaceCanvasTone() {
	const value = useContext(BoardspaceCanvasToneContext);

	if (!value) {
		throw new Error(
			"useBoardspaceCanvasTone must be used within BoardspaceCanvasToneProvider",
		);
	}

	return value;
}

export function BoardspaceCanvasToneMenu() {
	const { currentTone, isDarkMode, setCurrentTone } = useBoardspaceCanvasTone();
	const tones = isDarkMode ? DARK_TONES : LIGHT_TONES;

	return (
		<TldrawUiMenuSubmenu id="boardspace-canvas-tone" label="Canvas tone">
			<TldrawUiMenuGroup id="boardspace-canvas-tone-options">
				{tones.map((tone) => (
					<TldrawUiMenuCheckboxItem
						id={`boardspace-canvas-tone-${tone.id}`}
						key={tone.id}
						label={tone.label}
						checked={tone.id === currentTone}
						readonlyOk
						onSelect={() => setCurrentTone(tone.id)}
					/>
				))}
			</TldrawUiMenuGroup>
		</TldrawUiMenuSubmenu>
	);
}

function readStoredCanvasTonePreferences(): BoardspaceCanvasTonePreferences {
	try {
		const stored = window.localStorage.getItem(STORAGE_KEY);
		if (!stored) {
			return DEFAULT_PREFERENCES;
		}

		const parsed = JSON.parse(stored) as Partial<BoardspaceCanvasTonePreferences>;
		return {
			light: isLightCanvasTone(parsed.light) ? parsed.light : DEFAULT_PREFERENCES.light,
			dark: isDarkCanvasTone(parsed.dark) ? parsed.dark : DEFAULT_PREFERENCES.dark,
		};
	} catch {
		return DEFAULT_PREFERENCES;
	}
}

function writeStoredCanvasTonePreferences(
	preferences: BoardspaceCanvasTonePreferences,
) {
	window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
}

function isLightCanvasTone(value: unknown): value is LightCanvasTone {
	return LIGHT_TONES.some((tone) => tone.id === value);
}

function isDarkCanvasTone(value: unknown): value is DarkCanvasTone {
	return DARK_TONES.some((tone) => tone.id === value);
}
