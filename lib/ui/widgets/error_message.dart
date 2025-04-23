import 'package:flutter/material.dart';
import 'package:mydexpogo/utils/localization_helper.dart'; // Corrected import


class ErrorMessage extends StatelessWidget {
  final String message;
  final VoidCallback? onRetry;

  const ErrorMessage({required this.message, this.onRetry, super.key});

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.error_outline, color: Theme.of(context).colorScheme.error, size: 40),
            const SizedBox(height: 16),
            Text(
              // Pass 'message' as a positional argument
              l10n.error(message), // Use localized error prefix
              textAlign: TextAlign.center,
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
            if (onRetry != null) ...[
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: onRetry,
                child: Text(l10n.refreshButton), // Use refresh button text for retry
              ),
            ]
          ],
        ),
      ),
    );
  }
}
