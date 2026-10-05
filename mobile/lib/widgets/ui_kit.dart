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
        border: Border.all(color: borderColor ?? AppTheme.lightBorderSubtle),
        boxShadow: const [
          BoxShadow(
              color: Color(0x061F3A2C), blurRadius: 16, offset: Offset(0, 4))
        ],
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

/// The identity anchor, with natural-height text for long names and stations.
class PersonnelHero extends StatelessWidget {
  const PersonnelHero(
      {super.key,
      required this.name,
      required this.initials,
      required this.role,
      required this.position,
      required this.station});
  final String name, initials, role, position, station;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(22),
        decoration: BoxDecoration(
          color: AppTheme.brandDark,
          borderRadius: BorderRadius.circular(24),
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                    color: AppTheme.accentLime,
                    borderRadius: BorderRadius.circular(14)),
                alignment: Alignment.center,
                child: Text(initials, style: AppText.heading)),
            const SizedBox(width: 14),
            Expanded(
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                  Text('YOUR PERSONNEL WORKSPACE',
                      style: AppText.micro
                          .copyWith(color: AppTheme.accentLime, fontSize: 10)),
                  const SizedBox(height: 6),
                  Text(name,
                      style: AppText.display.copyWith(color: Colors.white)),
                ])),
          ]),
          const SizedBox(height: 20),
          Wrap(spacing: 8, runSpacing: 8, children: [
            Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                    color: const Color(0xFF335844),
                    borderRadius: BorderRadius.circular(8)),
                child: Text(role,
                    style: AppText.caption.copyWith(color: Colors.white))),
            Text(position, style: AppText.body.copyWith(color: Colors.white)),
          ]),
          const SizedBox(height: 12),
          Text(station,
              style: AppText.caption.copyWith(color: const Color(0xFFD0DED3))),
        ]),
      );
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
    return LayoutBuilder(builder: (context, constraints) {
      if (constraints.maxWidth < 360 ||
          MediaQuery.textScalerOf(context).scale(1) > 1.3) {
        return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(title, style: AppText.heading),
          if (trailing != null) ...[
            const SizedBox(height: AppSpace.sm),
            trailing!
          ],
        ]);
      }
      return Row(children: [
        Expanded(child: Text(title, style: AppText.heading)),
        if (trailing != null) ...[
          const SizedBox(width: AppSpace.sm),
          Flexible(child: trailing!)
        ],
      ]);
    });
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
          Flexible(
              child: Text(
            label,
            style: AppText.micro.copyWith(color: tone.foreground),
          )),
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
        // Flexible + ellipsis: a long value such as a file name must shorten
        // rather than run past the card edge.
        Flexible(
          child: Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: AppText.caption.copyWith(
              color: tone == null ? AppTheme.textSecondary : color,
              fontWeight: emphasis ? FontWeight.w600 : FontWeight.w500,
            ),
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
