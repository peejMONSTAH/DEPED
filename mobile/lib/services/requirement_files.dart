import 'package:file_picker/file_picker.dart';
import 'package:flutter/services.dart';
import '../models/personnel_document_model.dart';
import '../widgets/resume_splash.dart';

/// Match the web contract: selected files become ONE reviewable attachment.
/// Never upload files in a loop: the API replaces the requirement's attachment.
class RequirementFiles {
  static const limit = 10 * 1024 * 1024;
  static const channel = MethodChannel('digital201/documents');

  static Future<AcquiredDocument?> pick(String requirementName) async {
    final result =
        await ExternalActivity.run(() => FilePicker.platform.pickFiles(
              type: FileType.custom,
              allowedExtensions: ['pdf', 'jpg', 'jpeg', 'png'],
              allowMultiple: true,
              withData: true,
            ));
    if (result == null) return null;
    return prepare(result.files, requirementName);
  }

  static Future<AcquiredDocument> prepare(
      List<PlatformFile> files, String name) async {
    if (files.isEmpty || files.length > 20) {
      throw const FormatException('Choose between 1 and 20 files.');
    }
    var total = 0;
    final inputs = <Map<String, Object>>[];
    for (final file in files) {
      final ext = file.name.split('.').last.toLowerCase();
      final bytes = file.bytes;
      if (!['pdf', 'jpg', 'jpeg', 'png'].contains(ext) ||
          bytes == null ||
          bytes.isEmpty) {
        throw FormatException(
            'Cannot read "${file.name}". Choose a PDF, PNG or JPEG file.');
      }
      total += bytes.length;
      if (total > limit) {
        throw const FormatException(
            'Selected files must total no more than 10 MB.');
      }
      final pdf =
          bytes.length >= 5 && String.fromCharCodes(bytes.take(5)) == '%PDF-';
      final png = bytes.length >= 8 &&
          bytes[0] == 137 &&
          bytes[1] == 80 &&
          bytes[2] == 78 &&
          bytes[3] == 71 &&
          bytes[4] == 13 &&
          bytes[5] == 10 &&
          bytes[6] == 26 &&
          bytes[7] == 10;
      final jpg = bytes.length >= 3 &&
          bytes[0] == 255 &&
          bytes[1] == 216 &&
          bytes[2] == 255;
      if (!(ext == 'pdf'
          ? pdf
          : ext == 'png'
              ? png
              : jpg)) {
        throw FormatException(
            'The contents of "${file.name}" do not match its file type.');
      }
      inputs.add({
        'bytes': bytes,
        'mimeType': pdf
            ? 'application/pdf'
            : png
                ? 'image/png'
                : 'image/jpeg'
      });
    }
    if (files.length == 1) {
      return AcquiredDocument(
          name: files.single.name,
          bytes: files.single.bytes,
          mimeType: inputs.single['mimeType'] as String,
          sizeBytes: total);
    }
    Uint8List? bytes;
    try {
      bytes =
          await channel.invokeMethod<Uint8List>('combine', {'files': inputs});
    } on PlatformException catch (error) {
      throw Exception(error.message ??
          'Could not combine the selected files. Nothing was uploaded.');
    } on MissingPluginException {
      throw Exception(
          'Combining files requires the updated Android app. Nothing was uploaded.');
    }
    if (bytes == null || bytes.isEmpty || bytes.length > limit) {
      throw const FormatException(
          'The combined PDF is empty or exceeds 10 MB. Nothing was uploaded.');
    }
    final safeName = name.replaceAll(RegExp(r'[^a-zA-Z0-9_-]+'), '-');
    return AcquiredDocument(
        name:
            '${safeName.substring(0, safeName.length > 80 ? 80 : safeName.length)}.pdf',
        bytes: bytes,
        mimeType: 'application/pdf',
        sizeBytes: bytes.length);
  }
}
