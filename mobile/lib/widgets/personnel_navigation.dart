import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../theme/app_theme.dart';
import 'ui_kit.dart';

/// Reserves its own layout space: content and document actions never sit behind it.
class PersonnelNavigation extends StatelessWidget {
  const PersonnelNavigation(
      {super.key, required this.index, required this.onChanged});
  final int index;
  final ValueChanged<int> onChanged;
  static const destinations = [
    (0, LucideIcons.house, 'Home'),
    (2, LucideIcons.folderOpen, '201 Files'),
    (5, LucideIcons.clipboardList, 'Applications'),
    (3, LucideIcons.award, 'Service'),
    (1, LucideIcons.userRound, 'Profile'),
  ];

  @override
  Widget build(BuildContext context) => Material(
        color: AppTheme.lightBgCard,
        child: SafeArea(
            top: false,
            child: ContentWidth(
              shrinkWrapHeight: true,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(8, 8, 8, 8),
                child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      for (final destination in destinations)
                        Expanded(
                            child: Semantics(
                          selected: destination.$1 == index,
                          button: true,
                          child: InkWell(
                            borderRadius: BorderRadius.circular(14),
                            onTap: () => onChanged(destination.$1),
                            child: Padding(
                              padding: const EdgeInsets.symmetric(
                                  vertical: 8, horizontal: 2),
                              child: Column(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    AnimatedContainer(
                                      duration:
                                          const Duration(milliseconds: 180),
                                      padding: const EdgeInsets.symmetric(
                                          horizontal: 12, vertical: 5),
                                      decoration: BoxDecoration(
                                        color: destination.$1 == index
                                            ? AppTheme.brandDark
                                            : Colors.transparent,
                                        borderRadius: BorderRadius.circular(10),
                                      ),
                                      child: Icon(destination.$2,
                                          size: 20,
                                          color: destination.$1 == index
                                              ? Colors.white
                                              : AppTheme.textMuted),
                                    ),
                                    const SizedBox(height: 5),
                                    Text(destination.$3,
                                        textAlign: TextAlign.center,
                                        style: TextStyle(
                                            fontSize: 10,
                                            height: 1.2,
                                            fontWeight: destination.$1 == index
                                                ? FontWeight.w700
                                                : FontWeight.w500,
                                            color: destination.$1 == index
                                                ? AppTheme.brandDark
                                                : AppTheme.textMuted)),
                                  ]),
                            ),
                          ),
                        )),
                    ]),
              ),
            )),
      );
}
