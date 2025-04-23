import 'package:flutter/material.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:mydexpogo/config/api_config.dart';
import 'package:mydexpogo/data/models/list_entry.dart';
import 'package:mydexpogo/data/models/pokemon.dart'; // Need base Pokemon info
import 'package:mydexpogo/ui/widgets/loading_indicator.dart';
import 'package:mydexpogo/utils/image_helper.dart';
import 'package:mydexpogo/utils/localization_helper.dart';

class ListEntryItem extends StatelessWidget {
  final ListEntry entry;
  final Pokemon pokemon; // Pass the full Pokemon data for context
  final String locale;
  // ** Updated Callbacks for specific toggles **
  final VoidCallback onToggleNormalMale;
  final VoidCallback onToggleNormalFemale;
  final VoidCallback onToggleShinyMale;
  final VoidCallback onToggleShinyFemale;
  final VoidCallback onRemove;

  const ListEntryItem({
    required this.entry,
    required this.pokemon,
    required this.locale,
    required this.onToggleNormalMale,
    required this.onToggleNormalFemale,
    required this.onToggleShinyMale,
    required this.onToggleShinyFemale,
    required this.onRemove,
    super.key,
  });

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final textTheme = Theme.of(context).textTheme;
    final bool hasGenderDiff = pokemon.hasGenderDifferences;
    final bool hasShiny = pokemon.hasShiny; // Check if shiny is possible

    // Get image for the specific form/costume (non-shiny version for display)
    String? iconUrl = pokemon.getImageUrl(form: entry.form, costume: entry.costume);
    iconUrl ??= ApiConfig.fallbackPokemonIconUrl(pokemon.dexNr);

    // Build display name with form/costume
    String displayName = pokemon.localizedName(locale);
    List<String> variations = [];
    if (entry.form != null) variations.add(entry.form!);
    if (entry.costume != null) variations.add(entry.costume!);
    if (variations.isNotEmpty) {
        displayName += ' (${variations.join(', ')})';
    }

    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 8.0, vertical: 4.0),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 8.0, horizontal: 12.0),
        child: Row(
          children: [
            // Icon
            CachedNetworkImage(
              imageUrl: iconUrl,
              placeholder: (context, url) => const LoadingIndicator(size: 30),
              errorWidget: (context, url, error) => fallbackPokemonImage(pokemon.dexNr, size: 40),
              height: 40,
              width: 40,
              fit: BoxFit.contain,
            ),
            const SizedBox(width: 12),
            // Name and Notes
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(displayName, style: textTheme.titleMedium),
                  if (entry.notes != null && entry.notes!.isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.only(top: 2.0),
                        child: Text(
                          entry.notes!,
                          style: textTheme.bodySmall,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                ],
              ),
            ),
            const SizedBox(width: 8),

            // --- Detailed Checkboxes ---
            // Normal Row
            _buildGenderCheckboxRow(
              context: context,
              label: l10n.normalLabel, // "Normal"
              showMale: hasGenderDiff,
              showFemale: hasGenderDiff,
              maleValue: entry.collectedNormalMale,
              femaleValue: entry.collectedNormalFemale,
              onToggleMale: onToggleNormalMale,
              onToggleFemale: onToggleNormalFemale,
            ),

            // Shiny Row (only if shiny exists for this Pokemon)
            if (hasShiny) ...[
                const SizedBox(width: 8), // Spacer between normal and shiny
                _buildGenderCheckboxRow(
                  context: context,
                  label: l10n.shinyTargetLabel, // "Shiny"
                  showMale: hasGenderDiff,
                  showFemale: hasGenderDiff,
                  maleValue: entry.collectedShinyMale,
                  femaleValue: entry.collectedShinyFemale,
                  onToggleMale: onToggleShinyMale,
                  onToggleFemale: onToggleShinyFemale,
                  icon: Icons.star, // Add shiny indicator
                  iconColor: Colors.amber.shade700,
                ),
            ],
            // --- End Checkboxes ---

             // Remove Button
            IconButton(
              icon: Icon(Icons.remove_circle_outline, color: Theme.of(context).colorScheme.error),
              tooltip: l10n.removeEntry,
              onPressed: onRemove,
              visualDensity: VisualDensity.compact,
              padding: const EdgeInsets.only(left: 8), // Add padding
              constraints: const BoxConstraints(), // Remove default large padding
            ),
          ],
        ),
      ),
    );
  }

  // Helper widget to build a row of checkboxes (Male/Female or just Male if no gender diff)
  Widget _buildGenderCheckboxRow({
    required BuildContext context,
    required String label,
    required bool showMale, // True if gender diff exists
    required bool showFemale, // True if gender diff exists
    required bool maleValue,
    required bool femaleValue,
    required VoidCallback onToggleMale,
    required VoidCallback onToggleFemale,
    IconData? icon, // Optional icon (for shiny)
    Color? iconColor,
  }) {
    final textTheme = Theme.of(context).textTheme;
    final l10n = context.l10n;
    final bool showOnlyMale = !showMale; // If no gender diff, only show one checkbox

    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Row(
          mainAxisSize: MainAxisSize.min,
          children: [
             if (icon != null) Icon(icon, size: 14, color: iconColor),
             if (icon != null) const SizedBox(width: 2),
             Text(label, style: textTheme.bodySmall?.copyWith(fontWeight: FontWeight.bold)),
          ],
        ),
        Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Male Checkbox (or Normal if no gender diff)
            Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                 if (!showOnlyMale) Text(l10n.maleLabel, style: textTheme.bodySmall),
                 Checkbox(
                    value: maleValue,
                    onChanged: (_) => onToggleMale(),
                    visualDensity: VisualDensity.compact,
                    materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                 ),
              ],
            ),
            // Female Checkbox (only if gender diff exists)
            if (showFemale)
               Column(
                 mainAxisSize: MainAxisSize.min,
                 children: [
                    Text(l10n.femaleLabel, style: textTheme.bodySmall),
                    Checkbox(
                       value: femaleValue,
                       onChanged: (_) => onToggleFemale(),
                       visualDensity: VisualDensity.compact,
                       materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    ),
                 ],
               ),
          ],
        ),
      ],
    );
  }
}
