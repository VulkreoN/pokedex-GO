import 'package:flutter/material.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:mydexpogo/config/api_config.dart'; // Corrected import
import 'package:mydexpogo/data/models/pokemon.dart'; // Corrected import
import 'package:mydexpogo/data/models/quest.dart'; // Corrected import
import 'package:mydexpogo/data/models/quest_reward.dart'; // Corrected import
import 'package:mydexpogo/ui/widgets/loading_indicator.dart'; // Corrected import
import 'package:mydexpogo/utils/image_helper.dart'; // Corrected import
import 'package:mydexpogo/utils/localization_helper.dart'; // Corrected import

import 'package:collection/collection.dart'; // For firstWhereOrNull

class QuestListItem extends StatelessWidget {
  final Quest quest;
  final String locale;
  final Pokemon? pokemonRewardData; // Optional: Pass looked-up Pokemon data

  const QuestListItem({
    required this.quest,
    required this.locale,
    this.pokemonRewardData,
    super.key,
  });

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final textTheme = Theme.of(context).textTheme;

    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 8.0, vertical: 4.0),
      child: Padding(
        padding: const EdgeInsets.all(12.0),
        child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(quest.localizedQuest(locale), style: textTheme.titleMedium),
              const SizedBox(height: 8),
              Wrap( // Use Wrap for multiple rewards
                spacing: 8.0,
                runSpacing: 4.0,
                children: quest.rewards.map((reward) => _buildRewardChip(context, reward, locale)).toList(),
              )
            ]
        ),
      ),
    );
  }

  Widget _buildRewardChip(BuildContext context, QuestReward reward, String locale) {
    final l10n = context.l10n;
    String label = reward.localizedName(locale);
    Widget? leading;
    bool isShiny = reward.shiny;

    String? imageUrl = reward.iconUrl; // Use iconUrl helper from model
    int? dexNr = reward.dexNr;

    if (reward.type == 'POKEMON' && dexNr != null) {
      imageUrl ??= ApiConfig.fallbackPokemonIconUrl(dexNr); // Fallback icon
      // Optionally add Pokemon name if not already in reward.name
      // label = pokemonRewardData?.localizedName(locale) ?? label;
    } else if (reward.type == 'ITEM') {
      // TODO: Get item icon URL based on reward.id (needs item mapping)
      label = "${reward.amount ?? 1}x $label";
    } else if (reward.type == 'STARDUST') {
      // TODO: Get stardust icon
      label = "${reward.amount ?? '?'} ${l10n.staminaLabel}"; // Placeholder label
    } else if (reward.type == 'ENERGY') {
      // TODO: Get mega energy icon based on reward.id (Pokemon dexNr)
      label = "${reward.amount ?? '?'} ${pokemonRewardData?.localizedName(locale) ?? l10n.unknownPokemon} ${'Energy'}"; // Placeholder
    }
    // Add more reward types (Candy, XL Candy, etc.)

    if (imageUrl != null) {
      leading = Stack(
        alignment: Alignment.bottomRight,
        children: [
          CachedNetworkImage(
            imageUrl: imageUrl,
            placeholder: (context, url) => const LoadingIndicator(size: 15),
            errorWidget: (context, url, error) => const Icon(Icons.error_outline, size: 20),
            height: 20,
            width: 20,
            fit: BoxFit.contain,
          ),
          if (isShiny)
            Icon(Icons.star, color: Colors.amber.shade700, size: 12),
        ],
      );
    }


    return Chip(
      avatar: leading,
      label: Text(label),
      visualDensity: VisualDensity.compact,
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
    );
  }
}