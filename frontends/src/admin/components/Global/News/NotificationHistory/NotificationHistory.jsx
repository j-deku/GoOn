import { useState, useEffect } from 'react';
import { List, ListItem, ListItemText, Pagination, Stack } from '@mui/material';
import axiosInstanceAdmin from '../../../../../../axiosInstanceAdmin';

export default function NotificationsHistory() {
  const [data, setData] = useState({ notifications: [], page:1, pages:1 });
  const fetchPage = async page => {
    const res = await axiosInstanceAdmin.get('/api/notifications', { params:{ page } });
    setData(res.data);
  };
  useEffect(()=>{ fetchPage(1) }, []);

  return (
    <Stack spacing={2} p={2}>
      <List>
        {data.notifications.map(n => (
          <ListItem key={n._id} divider>
            <ListItemText
              primary={n.message}
              secondary={new Date(n.createdAt).toLocaleString()}
            />
          </ListItem>
        ))}
      </List>
      <Pagination 
        count={data.pages} 
        page={data.page} 
        onChange={(_,p)=>fetchPage(p)} 
      />
    </Stack>
  );
}
