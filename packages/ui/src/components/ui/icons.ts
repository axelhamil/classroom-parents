/**
 * Icons named by the concept they carry, never by their glyph.
 *
 * Why: one concept must always draw the same glyph across the app and the site, and swapping a
 * glyph must be a one line change. Contract: apps import a concept from this module, never from
 * the glyph library (a Biome rule enforces it); one export per concept, one glyph per concept.
 * Two concepts may share a glyph, a concept never has two. A missing concept is added here,
 * named by its meaning.
 */
import {
  BookOpen,
  Bus,
  ClipboardCheck,
  type LucideIcon,
  NotebookPen,
  PenLine,
  Waves,
} from "lucide-react";

export type Icon = LucideIcon;

export {
  Accessibility as AccessibilityIcon,
  AlarmClock as ReminderIcon,
  ArrowDown as MoveDownIcon,
  ArrowLeft as BackIcon,
  ArrowUp as MoveUpIcon,
  Backpack as ChildIcon,
  Ban as NeverIcon,
  Bell as NotificationsIcon,
  BellOff as AlertsOffIcon,
  BellRing as AlertsOnIcon,
  BookOpen as CoursesIcon,
  BookOpenCheck as ReadClassroomIcon,
  CalendarCheck as NothingDueIcon,
  CalendarClock as DeadlineMovedIcon,
  CalendarDays as CalendarIcon,
  CalendarOff as NoCalendarIcon,
  CalendarPlus as AddToCalendarIcon,
  CalendarPlus as NewDeadlinesIcon,
  CalendarRange as WeeklyDigestIcon,
  CalendarSync as SubscribeCalendarIcon,
  CalendarX as DeadlineCancelledIcon,
  ChartColumn as WorkloadIcon,
  Check as DoneIcon,
  CheckCheck as AllDoneIcon,
  ChevronDown as ShowMoreIcon,
  ChevronLeft as PreviousIcon,
  ChevronRight as NextIcon,
  ChevronRight as OpenRowIcon,
  ChevronsDownUp as ShorterIcon,
  ChevronsLeftRight as WidenIcon,
  ChevronsRightLeft as NarrowIcon,
  ChevronsUpDown as TallerIcon,
  ChevronsUpDown as PickFromListIcon,
  ChevronUp as ShowLessIcon,
  CircleCheck as StepDoneIcon,
  CircleDashed as StepPendingIcon,
  ClipboardList as CourseworkIcon,
  ClockAlert as OverdueIcon,
  Cookie as CookiesIcon,
  Copy as CopyIcon,
  Database as SubProcessorsIcon,
  Download as InstallIcon,
  Ellipsis as MoreIcon,
  ExternalLink as ExternalLinkIcon,
  EyeOff as HideIcon,
  EyeOff as NeverReadIcon,
  FileText as DocumentIcon,
  Flame as BusyDayIcon,
  Globe as BrowserIcon,
  GripVertical as DragHandleIcon,
  History as PastIcon,
  Hourglass as SyncingIcon,
  House as HomeIcon,
  Info as InfoIcon,
  KeyRound as CredentialsIcon,
  Laptop as ComputerIcon,
  LayoutGrid as ArrangeIcon,
  Link2 as LinkAccountIcon,
  ListChecks as PackBagIcon,
  ListFilter as FilterIcon,
  LogOut as SignOutIcon,
  Mail as EmailIcon,
  Map as TourIcon,
  MapPinOff as NotFoundIcon,
  Megaphone as AnnouncementsIcon,
  Moon as DarkThemeIcon,
  MousePointerClick as UseAnotherAccountIcon,
  OctagonAlert as ErrorIcon,
  Palette as ColorIcon,
  Pencil as EditIcon,
  PencilOff as ReadOnlyIcon,
  Plus as AddIcon,
  Printer as PrintIcon,
  RotateCcw as RetryIcon,
  Scale as RightsIcon,
  ScanSearch as AnalyzingIcon,
  School as SchoolAccountIcon,
  School as SchoolIcon,
  ScrollText as TermsIcon,
  SearchCheck as ConfirmDateIcon,
  SearchX as AnalysisFailedIcon,
  Settings as SettingsIcon,
  Share as IosShareIcon,
  Share2 as ShareIcon,
  ShieldAlert as SecurityCheckIcon,
  ShieldCheck as PrivacyIcon,
  ShieldQuestion as SchoolPolicyIcon,
  Smartphone as PhoneIcon,
  Sparkles as CelebrateIcon,
  SquarePlus as AddToHomeScreenIcon,
  StickyNote as NotesIcon,
  Sun as LightThemeIcon,
  Sun as TodayIcon,
  SunMoon as SystemThemeIcon,
  Trash2 as DeleteIcon,
  TriangleAlert as WarningIcon,
  Unlink as UnlinkIcon,
  UserRoundCheck as ChildAccountIcon,
  UserRoundSearch as PickAccountIcon,
  UsersRound as FamilyIcon,
  WifiLow as WeakConnectionIcon,
  WifiOff as OfflineIcon,
  X as CloseIcon,
} from "lucide-react";

export {
  BookOpen as HomeworkIcon,
  Bus as SchoolTripIcon,
  ClipboardCheck as AssessmentIcon,
  NotebookPen as OtherEventIcon,
  PenLine as DocumentDueIcon,
  Waves as SwimmingIcon,
};

/**
 * The icon of each deadline category, keyed by the category tone the badge and the deadline
 * sheet already use as variants.
 *
 * Why: the app and the site draw the same categories; one table keeps them identical. Contract:
 * every category tone has exactly one icon, the same one as its named concept above.
 */
export const CATEGORY_ICONS = {
  assessment: ClipboardCheck,
  homework: BookOpen,
  schoolTrip: Bus,
  swimming: Waves,
  documentDue: PenLine,
  other: NotebookPen,
} as const satisfies Record<string, Icon>;

export type CategoryTone = keyof typeof CATEGORY_ICONS;
