import 'package:flutter/material.dart';

import '../theme/app_theme.dart';
import '../theme/tokens.dart';

/// Shared presentation primitives.
///
/// Each of these replaces a pattern that had been hand-rolled a dozen times
/// with slightly different padding, radius and colour every time. Using them
/// keeps new screens consistent by default.

/// Caps how wide content grows on large screens.
///
/// A phone layout stretched across a tablet turns every card into a thin band
/// and lets paragraphs run to line lengths that are uncomfortable to read. This
/// caps the content and centres it. Below [maxWidth] it changes nothing at all,
/// so phone layouts are untouched.
///
/// Wrap scrollable page bodies, not individual cards — the scroll view itself
/// should be inside the constraint so the scrollbar and pull-to-refresh line up
/// with the content rather than with the screen edge.
class ContentWidth extends StatelessWidget {
  const ContentWidth({
    super.key,
    required this.child,
    this.maxWidth = 640,
    this.shrinkWrapHeight = false,
  });

  final Widget child;
  final double maxWidth;

  /// Set for a child that must keep its own height, such as a
  /// `bottomNavigationBar`.
  ///
  /// The default centres on both axes, which a scrolling body wants but a
  /// bottom bar does not: given loose constraints a [Center] grows to the full
  /// height available, which left the nav bar floating in the middle of the
  /// screen on a tablet.
  final bool shrinkWrapHeight;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        if (constraints.maxWidth <= maxWidth) return child;
        final sized = SizedBox(width: maxWidth, child: child);
        if (shrinkWrapHeight) {
          return Align(
            alignment: Alignment.bottomCenter,
            heightFactor: 1,
            child: sized,
          );
        }
        return Center(child: sized);
      },
    );
  }
}

/// A white surface with a hairline border. No drop shadow.
class AppCard extends StatelessWidget {
  const AppCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(AppSpace.lg),
    this.onTap,
    this.borderColor,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final VoidCallback? onTap;

  /// Overrides the hairline, for the rare card that carries state (for example
  /// an open vacancy). Used sparingly — a tinted border on every card is the
  /// kind of thing that made the old screens noisy.
  final Color? borderColor;

  @override
  Widget build(BuildContext context) {
    final decorated = Container(
      decoration: BoxDecoration(
        color: AppTheme.lightBgCard,
        borderRadius: AppRadius.lgAll,
        border: borderColor == null
            ? AppSurface.hairline
            : Border.all(color: borderColor!, width: 1),
      ),
      child: Padding(padding: padding, child: child),
    );

    if (onTap == null) return decorated;

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: AppRadius.lgAll,
        child: decorated,
      ),
    );
  }
}

/// A section heading. Optional trailing widget sits on the right.
///
/// Replaces the assorted icon-plus-bold-text rows, which used four different
/// font sizes between them.
class SectionHeading extends StatelessWidget {
  const SectionHeading({
    super.key,
    required this.title,
    this.trailing,
  });

  final String title;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: Text(
            title,
            style: AppText.heading,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ),
        if (trailing != null) ...[
          const SizedBox(width: AppSpace.sm),
          trailing!,
        ],
      ],
    );
  }
}

/// A small status label. Colour comes from [tone], never from the call site.
class StatusPill extends StatelessWidget {
  const StatusPill({
    super.key,
    required this.label,
    this.tone = AppStatusTone.neutral,
    this.icon,
  });

  final String label;
  final AppStatusTone tone;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpace.sm,
        vertical: AppSpace.xs,
      ),
      decoration: BoxDecoration(
        color: tone.background,
        borderRadius: AppRadius.smAll,
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 12, color: tone.foreground),
            const SizedBox(width: AppSpace.xs),
          ],
          Text(
            label,
            style: AppText.micro.copyWith(color: tone.foreground),
          ),
        ],
      ),
    );
  }
}

/// An icon plus a short piece of metadata, sized to its content.
///
/// Always wrap several of these in a [Wrap] rather than a [Row]: a fixed row of
/// metadata is what produced the overflow stripes on narrow phones.
class MetaItem extends StatelessWidget {
  const MetaItem({
    super.key,
    required this.icon,
    required this.label,
    this.tone,
    this.emphasis = false,
  });

  final IconData icon;
  final String label;

  /// Defaults to muted. Set only when the value carries state, such as an
  /// expiry that has already passed.
  final AppStatusTone? tone;
  final bool emphasis;

  @override
  Widget build(BuildContext context) {
    final color = tone?.foreground ?? AppTheme.textMuted;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 13, color: color),
        const SizedBox(width: AppSpace.xs),
        Text(
          label,
          style: AppText.caption.copyWith(
            color: tone == null ? AppTheme.textSecondary : color,
            fontWeight: emphasis ? FontWeight.w600 : FontWeight.w500,
          ),
        ),
      ],
    );
  }
}

/// A label above a value, for compact read-only facts.
class StatBlock extends StatelessWidget {
  const StatBlock({
    super.key,
    required this.label,
    required this.value,
    this.icon,
  });

  final String label;
  final String value;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Row(
          children: [
            if (icon != null) ...[
              Icon(icon, size: 13, color: AppTheme.textMuted),
              const SizedBox(width: AppSpace.xs),
            ],
            Expanded(
              child: Text(
                label,
                style: AppText.micro,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
        const SizedBox(height: AppSpace.xs),
        // scaleDown keeps a long value such as an employee ID on one line, so
        // two of these side by side stay the same height.
        FittedBox(
          fit: BoxFit.scaleDown,
          alignment: Alignment.centerLeft,
          child: Text(
            value,
            maxLines: 1,
            softWrap: false,
            style: AppText.heading,
          ),
        ),
      ],
    );
  }
}

/// Empty state: icon, headline, one supporting sentence, optional action.
class EmptyState extends StatelessWidget {
  const EmptyState({
    super.key,
    required this.icon,
    required this.title,
    required this.message,
    this.action,
  });

  final IconData icon;
  final String title;
  final String message;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpace.xl,
        vertical: AppSpace.xxxl,
      ),
      child: Column(
        children: [
          Icon(icon, size: 32, color: AppTheme.textMuted),
          const SizedBox(height: AppSpace.md),
          Text(title, style: AppText.heading, textAlign: TextAlign.center),
          const SizedBox(height: AppSpace.xs),
          Text(
            message,
            textAlign: TextAlign.center,
            style: AppText.caption,
          ),
          if (action != null) ...[
            const SizedBox(height: AppSpace.lg),
            action!,
          ],
        ],
      ),
    );
  }
}
