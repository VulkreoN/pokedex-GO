import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mydexpogo/ui/screens/game_info_screen.dart'; // Corrected import
import 'package:mydexpogo/ui/screens/my_lists_screen.dart'; // Corrected import
import 'package:mydexpogo/ui/screens/pokedex_screen.dart'; // Corrected import
import 'package:mydexpogo/ui/screens/settings_screen.dart'; // Corrected import
import 'package:mydexpogo/utils/localization_helper.dart'; // Corrected import


// State provider to track the selected index
final selectedIndexProvider = StateProvider<int>((ref) => 0);

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  static final List<Widget> _widgetOptions = <Widget>[
    const PokedexScreen(),
    const MyListsScreen(),
    const GameInfoScreen(),
    const SettingsScreen(),
  ];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final selectedIndex = ref.watch(selectedIndexProvider);
    final l10n = context.l10n; // Get localizations

    return Scaffold(
      // AppBar might be better placed within each screen for contextual actions
      // appBar: AppBar(
      //   title: Text(l10n.appTitle), // Example title
      // ),
      body: Center(
        child: _widgetOptions.elementAt(selectedIndex),
      ),
      bottomNavigationBar: BottomNavigationBar(
        items: <BottomNavigationBarItem>[
          BottomNavigationBarItem(
            icon: const Icon(Icons.catching_pokemon),
            label: l10n.pokedexTab,
          ),
          BottomNavigationBarItem(
            icon: const Icon(Icons.list_alt),
            label: l10n.myListsTab,
          ),
          BottomNavigationBarItem(
            icon: const Icon(Icons.info_outline),
            label: l10n.gameInfoTab,
          ),
          BottomNavigationBarItem(
            icon: const Icon(Icons.settings),
            label: l10n.settingsTab,
          ),
        ],
        currentIndex: selectedIndex,
        // Make sure inactive items are still visible
        type: BottomNavigationBarType.fixed, // Or shifting if you prefer animation
        // selectedItemColor: Theme.of(context).colorScheme.primary, // Customize colors
        // unselectedItemColor: Colors.grey,
        onTap: (index) => ref.read(selectedIndexProvider.notifier).state = index,
      ),
    );
  }
}