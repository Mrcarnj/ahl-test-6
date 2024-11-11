import os
from supabase import create_client, Client

# Initialize Supabase client
supabase_url = "https://zxjzdtepjpnunjkqrsjy.supabase.co"  # replace with your Supabase URL
supabase_key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp4anpkdGVwanBudW5qa3Fyc2p5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mjk2MzI0NzEsImV4cCI6MjA0NTIwODQ3MX0.Q38eMfnthqid-0eo3yyLSFhRWMIv85yhWDmVXmxNwDw"  # replace with your Supabase API key
supabase: Client = create_client(supabase_url, supabase_key)

# Bucket and folder settings
bucket_name = "logos"  # your storage bucket name in Supabase
folder_path = "/Volumes/icecop15/ahlLogos"  # local folder with .png files

# Upload .png files and update the database
def upload_images():
    for file_name in os.listdir(folder_path):
        if file_name.endswith(".png"):
            # Define file path and file name without extension for database matching
            file_path = os.path.join(folder_path, file_name)
            file_key = file_name.replace(".png", "")  # File name without .png extension
            
            # Upload file to Supabase storage with content type
            with open(file_path, "rb") as file:
                storage_response = supabase.storage.from_(bucket_name).upload(
                    path=f"{file_key}.png",
                    file=file,
                    options={"content-type": "image/png"}  # Set content type as PNG
                )
            
            if storage_response.get('error'):
                print(f"Error uploading {file_name}: {storage_response['error']}")
                continue  # Skip to the next file if there’s an upload error
            
            # Get public URL of uploaded file
            image_url = supabase.storage.from_(bucket_name).get_public_url(f"{file_key}.png")["publicURL"]
            
            # Update the database with the image URL
            data = supabase.from_("teams").update({"logo": image_url}).eq("abbreviation", file_key).execute()
            if data.get('error'):
                print(f"Error updating database for {file_key}: {data['error']}")
            else:
                print(f"Uploaded and updated database for {file_key}")

# Run the upload function
upload_images()