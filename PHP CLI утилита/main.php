<?php
$files = scandir("photos");
print_r($files);

foreach($files as $file) {
    if (is_file("photos/" . $file)) {
        $folder_name = date('Y.m.d', exif_read_data("photos/" . $file)['FileDateTime']);
        if (!file_exists("photos/" . $folder_name)) {
            mkdir("photos/" . $folder_name);
        }
        rename("photos\\" . $file, "photos\\" . $folder_name . "\\" . $file);
    }
}