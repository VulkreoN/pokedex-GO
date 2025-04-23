import 'package:flutter/material.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:mydexpogo/config/api_config.dart'; // Corrected import
import 'package:mydexpogo/data/models/list_entry.dart'; // Corrected import
import 'package:mydexpogo/data/models/pokemon.dart'; // Corrected import
import 'package:mydexpogo/ui/widgets/loading_indicator.dart'; // Corrected import
import 'package:mydexpogo/utils/image_helper.dart'; // Corrected import
import 'package:mydexpogo/utils/localization_helper.dart'; // Corrected import


class ListEntryItem extends StatelessWidget {
  final ListEntry entry;
  final Pokemon pokemon; // Pass the full Pokemon data for context
  final String locale;
  final ValueChanged<bool> onToggleMale;
  final ValueChanged<bool> onToggleFemale;
  final ValueChanged<bool> onToggleNormal;
  final VoidCallback onRemove;

  const ListEntryItem({
    required this.entry,
    required this.pokemon,
    required this.locale,
    required this.onToggleMale,
    required this.onToggleFemale,
    required this.onToggleNormal,
    required this.onRemove,
    super.key,
  });

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final textTheme = Theme.of(context).textTheme;
    final bool hasGenderDiff = pokemon.hasGenderDifferences;

    // Determine icon URL based on entry details
    String? iconUrl;
    if (entry.isShinyTarget) {
      iconUrl = pokemon.getShinyImageUrl(form: entry.form, costume: entry.costume);
    } else {
      iconUrl = pokemon.getImageUrl(form: entry.form, costume: entry.costume);
    }
    // Fallback if specific form/costume/shiny image isn't found
    iconUrl ??= ApiConfig.fallbackPokemonIconUrl(pokemon.dexNr);


    // Build display name with variations
    String displayName = pokemon.localizedName(locale);
    List<String> variations = [];
    if (entry.form != null) variations.add(entry.form!);
    if (entry.costume != null) variations.add(entry.costume!);
    if (entry.isMegaTarget) variations.add(l10n.megaTargetLabel); // Needs localization
    if (variations.isNotEmpty) {
      displayName += ' (${variations.join(', ')})';
    }


    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 8.0, vertical: 4.0),
      child: Padding(
        padding: const EdgeInsets.all(8.0),
        child: Row(
          children: [
            // Icon and Shiny indicator
            Stack(
              alignment: Alignment.bottomRight,
              children: [
                CachedNetworkImage(
                  imageUrl: iconUrl,
                  placeholder: (context, url) => const LoadingIndicator(size: 30),
                  errorWidget: (context, url, error) => fallbackPokemonImage(pokemon.dexNr, size: 40),
                  height: 40,
                  width: 40,
                  fit: BoxFit.contain,
                ),
                if (entry.isShinyTarget)
                  Icon(Icons.star, color: Colors.amber.shade700, size: 16),
              ],
            ),
            const SizedBox(width: 12),
            // Name and Variations
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(displayName, style: textTheme.titleMedium),
                  if (entry.notes != null && entry.notes!.isNotEmpty)
                    Text(entry.notes!, style: textTheme.bodySmall, maxLines: 1, overflow: TextOverflow.ellipsis),
                ],
              ),
            ),
            const SizedBox(width: 8),
            // Checkboxes
            if (hasGenderDiff) ...[
              Column(children: [ Text(l10n.maleLabel, style: textTheme.bodySmall), Checkbox(value: entry.collectedMale, onChanged: (val) => onToggleMale(val!), visualDensity: VisualDensity.compact)]),
              const SizedBox(width: 4),
              Column(children: [ Text(l10n.femaleLabel, style: textTheme.bodySmall), Checkbox(value: entry.collectedFemale, onChanged: (val) => onToggleFemale(val!), visualDensity: VisualDensity.compact)]),
            ] else ...[
              Column(children: [ Text(l10n.normalLabel, style: textTheme.bodySmall), Checkbox(value: entry.collectedNormal, onChanged: (val) => onToggleNormal(val!), visualDensity: VisualDensity.compact)]),
            ],
            // Remove Button
            IconButton(
              icon: Icon(Icons.remove_circle_outline, color: Theme.of(context).colorScheme.error),
              tooltip: l10n.removeEntry,
              onPressed: onRemove,
              visualDensity: VisualDensity.compact,
            ),
          ],
        ),
      ),
    );
  }
}