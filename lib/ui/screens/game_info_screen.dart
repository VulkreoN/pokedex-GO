import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mydexpogo/data/models/quest.dart'; // Corrected import
import 'package:mydexpogo/data/models/raid_boss.dart'; // Corrected import
import 'package:mydexpogo/providers/app_providers.dart'; // Corrected import
import 'package:mydexpogo/ui/widgets/error_message.dart'; // Corrected import
import 'package:mydexpogo/ui/widgets/loading_indicator.dart'; // Corrected import
import 'package:mydexpogo/utils/localization_helper.dart'; // Corrected import
import 'package:mydexpogo/ui/widgets/quest_list_item.dart'; // Corrected import
import 'package:mydexpogo/ui/widgets/raid_boss_list_item.dart'; // Corrected import

import 'package:collection/collection.dart'; // For firstWhereOrNull

class GameInfoScreen extends ConsumerWidget {
  const GameInfoScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final locale = ref.watch(localeProvider).languageCode;
    final pokedexMap = ref.watch(pokedexMapProvider); // Needed for lookups

    return DefaultTabController(
      length: 2, // Quests and Raids
      child: Scaffold(
        appBar: AppBar(
          title: Text(l10n.gameInfoTab),
          actions: [
            IconButton(
              icon: const Icon(Icons.refresh),
              tooltip: l10n.refreshButton,
              onPressed: () {
                // Invalidate providers to force refetch
                ref.invalidate(questProvider);
                ref.invalidate(raidBossProvider);
              },
            ),
          ],
          bottom: TabBar(
            tabs: [
              Tab(text: l10n.questsTab),
              Tab(text: l10n.raidsTab),
            ],
          ),
        ),
        body: TabBarView(
          children: [
            // --- Quests Tab ---
            ref.watch(questProvider).when(
              data: (quests) {
                if (quests.isEmpty) {
                  return Center(child: Text(l10n.noQuests));
                }
                return ListView.builder(
                  itemCount: quests.length,
                  itemBuilder: (context, index) {
                    final quest = quests[index];
                    // Find the primary Pokemon reward for display (if any)
                    final pokemonReward = quest.rewards.firstWhereOrNull((r) => r.type == 'POKEMON');
                    final pokemonData = pokemonReward?.dexNr != null ? pokedexMap[pokemonReward!.dexNr!] : null;

                    return QuestListItem( // You need to create this widget
                      quest: quest,
                      locale: locale,
                      pokemonRewardData: pokemonData, // Pass looked-up data
                    );
                  },
                );
              },
              loading: () => const LoadingIndicator(),
              error: (error, stack) => ErrorMessage(message: error.toString()),
            ),

            // --- Raids Tab ---
            ref.watch(raidBossProvider).when(
              data: (raidMap) {
                if (raidMap.isEmpty) {
                  return Center(child: Text(l10n.noRaids));
                }
                // Flatten the map into a list of sections/bosses
                final raidEntries = <Widget>[];
                // Define order (e.g., Mega, Lvl5, Lvl3, Lvl1) - adjust keys as needed based on API
                const raidOrder = ['legendary_mega', 'mega', 'lvl5', 'ultra_beast', 'lvl3', 'lvl1', 'ex'];

                for (final levelKey in raidOrder) {
                  if (raidMap.containsKey(levelKey)) {
                    final bosses = raidMap[levelKey]!;
                    if (bosses.isNotEmpty) {
                      // Add a header for the raid level
                      raidEntries.add(
                          Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 8.0),
                            child: Text(
                              levelKey.replaceAll('_', ' ').toUpperCase(), // Simple header
                              style: Theme.of(context).textTheme.titleLarge,
                            ),
                          )
                      );
                      // Add bosses for this level
                      raidEntries.addAll(bosses.map((boss) {
                        final pokemonData = boss.dexNr != null ? pokedexMap[boss.dexNr!] : null;
                        return RaidBossListItem( // You need to create this widget
                          raidBoss: boss,
                          locale: locale,
                          pokemonData: pokemonData,
                        );
                      }).toList());
                      raidEntries.add(const Divider()); // Separator between levels
                    }
                  }
                }

                if (raidEntries.isEmpty) {
                  return Center(child: Text(l10n.noRaids));
                }

                return ListView(children: raidEntries);
              },
              loading: () => const LoadingIndicator(),
              error: (error, stack) => ErrorMessage(message: error.toString()),
            ),
          ],
        ),
      ),
    );
  }
}