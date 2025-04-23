import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mydexpogo/data/models/custom_list.dart'; // Corrected import
import 'package:mydexpogo/providers/app_providers.dart'; // Corrected import
import 'package:mydexpogo/ui/screens/list_detail_screen.dart'; // Corrected import
import 'package:mydexpogo/ui/widgets/error_message.dart'; // Corrected import
import 'package:mydexpogo/ui/widgets/loading_indicator.dart'; // Corrected import
import 'package:mydexpogo/utils/localization_helper.dart'; // Corrected import

import 'package:collection/collection.dart'; // For firstWhereOrNull

class MyListsScreen extends ConsumerWidget {
  const MyListsScreen({super.key});

  void _showCreateListDialog(BuildContext context, WidgetRef ref) {
    final nameController = TextEditingController();
    final descriptionController = TextEditingController();
    final l10n = context.l10n;

    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(l10n.createListTitle),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: nameController,
              decoration: InputDecoration(hintText: l10n.listNameHint),
              autofocus: true,
            ),
            TextField(
              controller: descriptionController,
              decoration: InputDecoration(hintText: l10n.listDescriptionHint),
            ),
          ],
        ),
        actions: [
          TextButton(
            child: Text(l10n.cancelButton),
            onPressed: () => Navigator.of(context).pop(),
          ),
          TextButton(
            child: Text(l10n.createButton),
            onPressed: () async {
              final name = nameController.text.trim();
              if (name.isNotEmpty) {
                try {
                  await ref.read(customListsProvider.notifier).addList(
                    name,
                    descriptionController.text.trim(),
                  );
                  Navigator.of(context).pop(); // Close dialog on success
                } catch (e) {
                  Navigator.of(context).pop(); // Close dialog
                  ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(content: Text("Error: ${e.toString()}")) // Show error (e.g., duplicate name)
                  );
                }
              }
              // Else: Show validation error if name is empty?
            },
          ),
        ],
      ),
    );
  }

  void _showDeleteConfirmDialog(BuildContext context, WidgetRef ref, CustomList list) {
    final l10n = context.l10n;
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(l10n.deleteListTitle),
        content: Text(l10n.deleteListContent(list.name)),
        actions: [
          TextButton(
            child: Text(l10n.cancelButton),
            onPressed: () => Navigator.of(context).pop(),
          ),
          TextButton(
            style: TextButton.styleFrom(foregroundColor: Theme.of(context).colorScheme.error),
            child: Text(l10n.deleteButton),
            onPressed: () async {
              try {
                await ref.read(customListsProvider.notifier).deleteList(list.name);
                Navigator.of(context).pop(); // Close confirm dialog
              } catch (e) {
                Navigator.of(context).pop(); // Close confirm dialog
                ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text("Error deleting list: $e"))
                );
              }
            },
          ),
        ],
      ),
    );
  }

  void _importList(BuildContext context, WidgetRef ref) async {
    final l10n = context.l10n;
    try {
      final listName = await ref.read(customListsProvider.notifier).importList();
      ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(l10n.listImported(listName)))
      );
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text("${l10n.listImportError}: ${e.toString()}"))
      );
    }
  }

  void _exportList(BuildContext context, WidgetRef ref, CustomList list) async {
    final l10n = context.l10n;
    try {
      final listName = await ref.read(customListsProvider.notifier).exportList(list.name);
      // Share sheet is shown by the service. Show confirmation if needed.
      ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(l10n.listExported(listName))) // Maybe redundant if share sheet shown
      );
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text("${l10n.listExportError}: ${e.toString()}"))
      );
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final customLists = ref.watch(customListsProvider);
    final l10n = context.l10n;

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.myListsTab),
        actions: [
          IconButton(
            icon: const Icon(Icons.file_upload),
            tooltip: l10n.importList,
            onPressed: () => _importList(context, ref),
          ),
          IconButton(
            icon: const Icon(Icons.add),
            tooltip: l10n.createListTitle,
            onPressed: () => _showCreateListDialog(context, ref),
          ),
        ],
      ),
      body: customLists.isEmpty
          ? Center(child: Text(l10n.noLists, textAlign: TextAlign.center))
          : ListView.builder(
        itemCount: customLists.length,
        itemBuilder: (context, index) {
          final list = customLists[index];
          return ListTile(
            title: Text(list.name),
            subtitle: Text(list.description ?? ''),
            trailing: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(list.totalEntries.toString()), // Show count
                const SizedBox(width: 8),
                IconButton(
                  icon: const Icon(Icons.file_download),
                  tooltip: l10n.exportList,
                  onPressed: () => _exportList(context, ref, list),
                ),
                IconButton(
                  icon: Icon(Icons.delete, color: Theme.of(context).colorScheme.error),
                  tooltip: l10n.deleteButton,
                  onPressed: () => _showDeleteConfirmDialog(context, ref, list),
                ),
              ],
            ),
            onTap: () {
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (context) => ListDetailScreen(listName: list.name),
                ),
              );
            },
          );
        },
      ),
    );
  }
}