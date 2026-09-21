import React from 'react';
import {
  LayoutDashboard,
  Bell,
  ClipboardList,
  Search,
  CheckCircle2,
  Users,
  KeyRound,
  TrendingUp,
  Award,
  FolderKanban,
  FileBarChart,
  History,
  Settings,
  Home,
  PlusCircle,
  User,
  Briefcase,
  Building2,
  School,
  MapPin,
  GraduationCap,
  Phone,
  Mail,
  Lock,
  Unlock,
  Bot,
  Lightbulb,
  Info,
  Check,
  BadgeDollarSign,
  Send,
  Undo2,
  CheckCheck,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Clock,
  Sparkles,
  Zap,
  Shield,
  CheckSquare,
  Upload,
  Eye,
  EyeOff,
  Download,
  Trash2,
  X,
  Edit3,
  FileText,
  Folder,
  ChevronRight,
  ChevronDown,
  LogOut,
  UserPlus,
  Inbox,
  Menu,
  Sun,
  Moon,
  Receipt,
  BarChart3,
  RefreshCw,
  ChevronLeft,
  BadgeCheck,
  LucideProps
} from 'lucide-react';

export type IconName =
  | 'dashboard'
  | 'chevron-down'
  | 'menu'
  | 'notifications'
  | 'transactions'
  | 'validation'
  | 'approvals'
  | 'personnel'
  | 'credentials'
  | 'compliance'
  | 'promotions'
  | 'repository'
  | 'reports'
  | 'audit'
  | 'settings'
  | 'home'
  | 'new-transaction'
  | 'profile'
  | 'personal'
  | 'wes'
  | 'employment'
  | 'salary'
  | 'submitted'
  | 'under-review'
  | 'returned'
  | 'validated'
  | 'approved'
  | 'archived'
  | 'compliant'
  | 'warning'
  | 'error'
  | 'pending'
  | 'quick-action'
  | 'checklist'
  | 'upload'
  | 'view'
  | 'logout'
  | 'school'
  | 'location'
  | 'education'
  | 'phone'
  | 'email'
  | 'lock'
  | 'bot'
  | 'lightbulb'
  | 'inbox'
  | 'user-plus'
  | string;

interface AppIconProps extends Omit<LucideProps, 'ref'> {
  name: IconName;
  size?: number | string;
  className?: string;
  color?: string;
}

// Map legacy emoji strings and icon keys to Lucide icons
const iconMap: Record<string, React.FC<LucideProps>> = {
  // Navigation & Core Admin
  dashboard: LayoutDashboard,
  '📊': LayoutDashboard,
  menu: Menu,
  '☰': Menu,
  notifications: Bell,
  '🔔': Bell,
  transactions: ClipboardList,
  '📋': ClipboardList,
  validation: Search,
  search: Search,
  '🔍': Search,
  approvals: CheckCircle2,
  '✅': CheckCircle2,
  personnel: Users,
  '👥': Users,
  credentials: KeyRound,
  '🔑': KeyRound,
  compliance: TrendingUp,
  '📈': TrendingUp,
  promotions: Award,
  '🏆': Award,
  repository: FolderKanban,
  '📁': FolderKanban,
  reports: FileBarChart,
  audit: History,
  '📜': History,
  settings: Settings,
  '⚙️': Settings,

  // Personnel Portal
  home: Home,
  '🏠': Home,
  'new-transaction': PlusCircle,
  '➕': PlusCircle,
  profile: User,
  '👤': User,
  personal: User,
  wes: Briefcase,
  '💼': Briefcase,
  employment: Building2,
  '🏢': Building2,
  salary: BadgeDollarSign,
  '💰': BadgeDollarSign,
  '🆕': Sparkles,
  school: School,
  '🏫': School,
  location: MapPin,
  '📍': MapPin,
  education: GraduationCap,
  '🎓': GraduationCap,
  phone: Phone,
  '📞': Phone,
  email: Mail,
  '✉️': Mail,
  lock: Lock,
  '🔒': Lock,
  bot: Bot,
  '🤖': Bot,
  lightbulb: Lightbulb,
  '💡': Lightbulb,
  inbox: Inbox,
  '📭': Inbox,
  'user-plus': UserPlus,

  // Statuses & Badges
  submitted: Send,
  '📨': Send,
  'under-review': Search,
  returned: Undo2,
  '↩️': Undo2,
  validated: CheckCircle2,
  approved: CheckCheck,
  '🎉': CheckCheck,
  archived: Folder,
  compliant: CheckCircle,
  '✓': Check,
  check: Check,
  warning: AlertTriangle,
  '⚠️': AlertTriangle,
  error: XCircle,
  '✗': XCircle,
  pending: Clock,
  '⏳': Clock,
  '🕒': Clock,

  // Action Icons
  'quick-action': Zap,
  '⚡': Zap,
  checklist: CheckSquare,
  '📌': CheckSquare,
  upload: Upload,
  '📤': Upload,
  view: Eye,
  'view-off': EyeOff,
  '👁️': Eye,
  download: Download,
  '📥': Download,
  delete: Trash2,
  '🗑️': Trash2,
  close: X,
  '❌': X,
  edit: Edit3,
  '✏️': Edit3,
  logout: LogOut,
  'chevron-down': ChevronDown,
  sun: Sun,
  moon: Moon,

  // Names the app was already calling that had no entry here. Every one of them
  // silently fell through to FileText, which is why unrelated statuses all
  // rendered the same document glyph.
  alert: AlertTriangle,
  security: Shield,
  receipt: Receipt,
  clock: Clock,
  document: FileText,
  award: Award,
  folder: Folder,
  history: History,
  verification: BadgeCheck,
  'chevron-left': ChevronLeft,
  plantilla: Building2,
  users: Users,
  chart: BarChart3,
  sync: RefreshCw,
};

export const AppIcon: React.FC<AppIconProps> = ({
  name,
  size = 18,
  className = '',
  color,
  strokeWidth = 2,
  ...props
}) => {
  const IconComponent = iconMap[name] || FileText;

  // IconName is widened with `| string`, so a typo type-checks and then renders
  // a generic document. Surface it in dev instead of letting it look intentional.
  if ((import.meta as any).env?.DEV && !iconMap[name]) {
    console.warn(`[AppIcon] unknown icon "${name}" — falling back to FileText.`);
  }

  return (
    <IconComponent
      size={size}
      className={`app-icon ${className}`}
      color={color || 'currentColor'}
      strokeWidth={strokeWidth}
      style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}
      {...props}
    />
  );
};
